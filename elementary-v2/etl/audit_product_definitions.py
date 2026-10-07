"""Offline SQL06-24 contract comparison; no database writes or connections.

Restricted to the grammar used by these migrations, not a full SQL interpreter.
Token equality is stronger than name presence, not proof of runtime behaviour.
Unknown/differing definitions must be reviewed, never auto-applied.
"""
from __future__ import annotations

import json
import hashlib
import re
from pathlib import Path

from etl.audit_product_schema import PROJECT, split_top_level, table_body

IDENT = r'(?:public\s*\.\s*)?([a-z_][a-z_0-9]*)'

LEXER = re.compile(r"--[^\n]*|/\*[\s\S]*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|\$\w*\$|[a-zA-Z_][a-zA-Z_0-9]*|\d+(?:\.\d+)?|::|[^\s]", re.M)


def uncomment(source: str) -> str:
    return ' '.join(t for t in LEXER.findall(source) if not t.startswith(('--', '/*')))


def tokens(source: str | None) -> list[str]:
    return [t if t.startswith(("'", '"')) else t.lower() for t in LEXER.findall(source or '') if not t.startswith(('--', '/*'))]


def canonical(source: str | None) -> list[str]:
    value = tokens(source)
    for old, new in [('timestamp with time zone', 'timestamptz'), ('character varying', 'varchar'), ('int4', 'integer'), ('int8', 'bigint'), ('bool', 'boolean')]:
        before, after, i = old.split(), [], 0
        while i < len(value):
            if value[i:i + len(before)] == before:
                after.append(new)
                i += len(before)
            else:
                after.append(value[i])
                i += 1
        value = after
    return value


def expression(source: str | None) -> list[str]:
    value = canonical(source)
    # Only peel a balanced pair enclosing the entire expression.
    while value and value[0] == '(' and value[-1] == ')':
        depth = 0
        for index, token in enumerate(value):
            depth += (token == '(') - (token == ')')
            if depth == 0:
                break
        if index != len(value) - 1:
            break
        value = value[1:-1]
    return value


def default_value(value: str | None, dtype: str) -> list[str]:
    parts = expression(value)
    # PostgreSQL adds target-type casts to simple literal defaults.
    if len(parts) >= 3 and parts[1] == '::' and (parts[0].startswith("'") or parts[0] == 'null') and parts[2:] == canonical(dtype):
        parts = parts[:1]
    return parts


def index_definition(source: str) -> list[str]:
    # Deparser adds a parenthesized predicate after WHERE.
    pieces = re.split(r'\bwhere\b', source, maxsplit=1, flags=re.I)
    return canonical(pieces[0]) + (['where'] + expression(pieces[1]) if len(pieces) > 1 else [])


def parameters(source: str) -> list[dict]:
    if not source.strip():
        return []
    result = []
    for part in split_top_level(source):
        pieces = re.split(r'\bdefault\b', part, maxsplit=1, flags=re.I)
        name, dtype = pieces[0].strip().split(None, 1)
        result.append({'name': name.lower(), 'type': canonical(dtype), 'default': default_value(pieces[1] if len(pieces) > 1 else None, dtype), 'has_default': len(pieces) > 1})
    return result


def column_definition(part: str, origin: str) -> dict:
    name, rest = part.split(' ', 1)
    dtype = re.split(r'\b(?:not|null|primary|unique|references|default|check|constraint)\b', rest, maxsplit=1, flags=re.I)[0].strip()
    default = re.search(r'\bdefault\s+([\s\S]*?)(?=\b(?:check|references|constraint|not\s+null)\b|$)', rest, re.I)
    return {'column': name, 'type': dtype, 'nullable': not bool(re.search(r'not\s+null|primary\s+key', rest, re.I)), 'default': default[1].strip() if default else None, 'file': origin}


def expected(sql_dir: Path) -> dict:
    columns, routines, indexes, policies, fks = {}, {}, {}, {}, set()
    for path in sorted(p for p in sql_dir.glob('*.sql') if re.match(r'(0[6-9]|1[0-9]|2[0-4])_', p.name)):
        sql = uncomment(path.read_text(encoding='utf-8'))
        for match in re.finditer(r'create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?' + IDENT + r'\s*\(', sql, re.I):
            table = match[1].lower()
            for part in split_top_level(table_body(sql, match.end())):
                if re.match(r'(constraint|primary|foreign|unique|check)\b', part, re.I):
                    pk = re.search(r'primary\s+key\s*\(([^)]+)\)', part, re.I)
                    if pk:
                        for col in pk[1].split(','):
                            columns[(table, col.strip())]['nullable'] = False
                    continue
                col = column_definition(part, path.name)
                columns.setdefault((table, col['column']), col)
                ref = re.search(r'references\s+([\s\S]+)', part, re.I)
                if ref:
                    fks.add((table, tuple(canonical(f"FOREIGN KEY ({col['column']}) REFERENCES {ref[1]}"))))
        for match in re.finditer(r'alter\s+table\s+' + IDENT + r'([\s\S]*?);', sql, re.I):
            table, clause = match[1].lower(), match[2]
            for part in split_top_level(clause):
                add = re.match(r'add\s+column\s+(?:if\s+not\s+exists\s+)?(.+)', part, re.I)
                if add:
                    col = column_definition(add[1], path.name)
                    columns.setdefault((table, col['column']), col)
            for col in re.findall(r'alter\s+column\s+(\w+)\s+set\s+not\s+null', clause, re.I):
                columns[(table, col)]['nullable'] = False
            fk = re.search(r'foreign\s+key\s*\([\s\S]+', clause, re.I)
            if fk:
                fks.add((table, tuple(canonical(fk[0]))))
        for match in re.finditer(r'create\s+(?:or\s+replace\s+)?function\s+' + IDENT + r'\s*\(', sql, re.I):
            args = table_body(sql, match.end())
            tail = sql[match.end() + len(args) + 1:]
            body = re.search(r'\bas\s+(\$\w*\$)([\s\S]*?)\1([^;]*);', tail, re.I)
            if not body:
                raise ValueError(f'Unsupported routine body: {path.name}:{match[1]}')
            header = tail[:body.start()]
            lang = re.search(r'language\s+(\w+)', header + ' ' + body[3], re.I)
            result = re.search(r'returns\s+([\s\S]*?)(?=\blanguage\b|\bstable\b|\bimmutable\b|\bvolatile\b|\bsecurity\b|\bset\b|$)', header, re.I)
            config = re.search(r'set\s+search_path\s*=\s*(.+)$', header, re.I)
            routines[match[1].lower()] = {'file': path.name, 'arguments': args, 'result': result[1].strip(), 'language': lang[1].lower(), 'volatility': 's' if re.search(r'\bstable\b', header, re.I) else 'i' if re.search(r'\bimmutable\b', header, re.I) else 'v', 'security_definer': bool(re.search(r'security\s+definer', header, re.I)), 'search_path': config[1].strip() if config else None, 'body': body[2]}
        for match in re.finditer(r'create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?' + IDENT + r'\s+on\s+([^;]+);', sql, re.I):
            definition = match[3].strip()
            if not re.search(r'\busing\b', definition, re.I):
                definition = re.sub(r'^(\w+)\s*\(', r'\1 USING btree (', definition)
            indexes.setdefault(match[2].lower(), {'file': path.name, 'unique': bool(match[1]), 'definition': definition})
        for match in re.finditer(r'create\s+policy\s+"([^"]+)"\s+on\s+' + IDENT + r'([^;]+);', sql, re.I):
            clause = match[3]
            command = re.search(r'for\s+(\w+)', clause, re.I)
            roles = re.search(r'\bto\s+(.+?)(?=\busing\b|\bwith\b|$)', clause, re.I)
            using = re.search(r'\busing\s*\(', clause, re.I)
            check = re.search(r'with\s+check\s*\(', clause, re.I)
            policies[(match[2].lower(), match[1])] = {'file': path.name, 'cmd': command[1].upper() if command else 'ALL', 'roles': sorted(r.strip().lower() for r in roles[1].split(',')) if roles else ['public'], 'qual': table_body(clause, using.end()) if using else None, 'with_check': table_body(clause, check.end()) if check else None}
    return {'columns': columns, 'functions': routines, 'indexes': indexes, 'policies': policies, 'foreign_keys': fks}


def audit_definitions(sql_dir: Path, catalog: dict, definitions: dict) -> dict:
    contract = expected(sql_dir)
    live_cols = {(c['table'], c['column']): c for c in definitions['columns']}
    live_funcs = {f['name']: f for f in definitions['functions']}
    live_indexes = {i['name']: i for i in catalog['indexes']}
    live_policies = {(p['tablename'], p['policyname']): p for p in catalog['policies']}
    result = {'scope': 'restricted SQL contract comparison, not runtime/role verification', 'columns': [], 'functions': [], 'indexes': [], 'policies': [], 'foreign_keys': []}
    for key, want in contract['columns'].items():
        actual = live_cols.get(key)
        differences = ['missing'] if actual is None else [field for field in ('type', 'nullable', 'default') if (canonical(want[field]) != canonical(actual[field]) if field == 'type' else default_value(want[field], want['type']) != default_value(actual[field], actual['type']) if field == 'default' else want[field] != actual[field])]
        result['columns'].append({'key': '.'.join(key), 'file': want['file'], 'differences': differences, **({'expected': want, 'live': actual} if differences else {})})
    for name, want in contract['functions'].items():
        actual = live_funcs.get(name)
        differences = ['missing'] if actual is None else [field for field in ('arguments', 'result', 'language', 'volatility', 'security_definer', 'body') if (canonical(want[field]) != canonical(actual[field]) if field in ('arguments', 'result', 'body') else want[field] != actual[field])]
        if actual is not None:
            config = actual['config'] or []
            actual_path = next((c.split('=', 1)[1] for c in config if c.startswith('search_path=')), None)
            expected_path = '""' if want['search_path'] == "''" else want['search_path']
            if tokens(expected_path) != tokens(actual_path):
                differences.append('search_path')
        argument_check = {}
        if actual is not None:
            wanted_params, actual_params = parameters(want['arguments']), parameters(actual['arguments'])
            argument_check = {'argument_identity_matches': [(p['name'], p['type']) for p in wanted_params] == [(p['name'], p['type']) for p in actual_params], 'argument_default_tokens_match': wanted_params == actual_params}
        result['functions'].append({'name': name, 'file': want['file'], 'differences': differences, **argument_check, **({'expected': {k:v for k,v in want.items() if k != 'body'}, 'live': {k:v for k,v in (actual or {}).items() if k != 'body'}} if differences else {})})
    for name, want in contract['indexes'].items():
        actual = live_indexes.get(name)
        live_body = re.search(r'\bon\s+(?:public\.)?(.+)$', actual['definition'], re.I)[1] if actual else None
        differences = ['missing'] if actual is None else ['definition'] if index_definition(want['definition']) != index_definition(live_body) or want['unique'] != ('CREATE UNIQUE INDEX' in actual['definition']) else []
        result['indexes'].append({'name': name, 'file': want['file'], 'differences': differences, **({'expected': want, 'live': actual} if differences else {})})
    for key, want in contract['policies'].items():
        actual = live_policies.get(key)
        differences = ['missing'] if actual is None else [field for field in ('cmd', 'roles', 'qual', 'with_check') if (expression(want[field]) != expression(actual[field]) if field in ('qual', 'with_check') else want[field] != (sorted(actual[field]) if field == 'roles' else actual[field]))]
        result['policies'].append({'key': '.'.join(key), 'file': want['file'], 'differences': differences, **({'expected': want, 'live': actual} if differences else {})})
    live_fks = {(c['table'], tuple(canonical(c['definition']))) for c in catalog['constraints'] if c['type'] == 'f'}
    for table, definition in sorted(contract['foreign_keys']):
        result['foreign_keys'].append({'table': table, 'definition': ' '.join(definition), 'matches': (table, definition) in live_fks})
    result['summary'] = {key: {'checked': len(value), 'different': sum(bool(r.get('differences')) if key != 'foreign_keys' else not r['matches'] for r in value)} for key, value in result.items() if isinstance(value, list)}
    result['sql_sha256'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(sql_dir.glob('*.sql')) if re.match(r'(0[6-9]|1[0-9]|2[0-4])_', p.name)}
    result['limitations'] = ['Known migration grammar only; not an AST/semantic equivalence proof', 'No CHECK/UNIQUE/PK expression or trigger equivalence test', 'No storage bucket, migration history or seed data equivalence', 'No actual owner/non-owner write tests or API exposed-schema confirmation', 'Unexpected live-only columns/indexes/functions/policies are not removed', 'No SQL applied and no automatic remediation']
    return result


if __name__ == '__main__':
    root = PROJECT / 'docs/research/audit2'
    report = audit_definitions(PROJECT / 'sql', json.loads((root / 'live_catalog_20261006.json').read_text(encoding='utf-8')), json.loads((root / 'live_definitions_20261006.json').read_text(encoding='utf-8')))
    print(json.dumps(report, ensure_ascii=True, indent=2))
