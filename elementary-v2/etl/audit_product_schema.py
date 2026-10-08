"""Offline declaration-presence audit against a captured public catalog.

Does not connect to a database or execute SQL. Not a PostgreSQL semantic parser:
presence is not proof of matching types/defaults/FK actions or routine bodies.
Prints JSON to stdout; save reviewed outputs through the normal editing workflow.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
IDENT = r'(?:public\.)?([a-z_][a-z_0-9]*)'


def split_top_level(value: str) -> list[str]:
    """Split column lists without splitting numeric typmods or quoted values."""
    result, start, depth, quoted, i = [], 0, 0, False, 0
    while i < len(value):
        char = value[i]
        if char == "'":
            if quoted and i + 1 < len(value) and value[i + 1] == "'":
                i += 2
                continue
            quoted = not quoted
        elif not quoted:
            depth += (char == '(') - (char == ')')
            if char == ',' and depth == 0:
                result.append(value[start:i].strip())
                start = i + 1
        i += 1
    if depth != 0 or quoted:
        raise ValueError('Unbalanced SQL list; audit must not silently continue')
    result.append(value[start:].strip())
    return result


def table_body(sql: str, start: int) -> str:
    depth, quoted, i = 1, False, start
    while i < len(sql):
        char = sql[i]
        if char == "'":
            if quoted and i + 1 < len(sql) and sql[i + 1] == "'":
                i += 2
                continue
            quoted = not quoted
        elif not quoted:
            depth += (char == '(') - (char == ')')
            if depth == 0:
                return sql[start:i]
        i += 1
    raise ValueError('Unclosed CREATE TABLE body')


def declarations(source: str) -> dict:
    # Repository migrations use unquoted identifiers. Comments are not statements.
    sql = re.sub(r'/\*[\s\S]*?\*/|--[^\n]*', '', source)
    columns: dict[str, set[str]] = {}
    for match in re.finditer(r'create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?' + IDENT + r'\s*\(', sql, re.I):
        table = match[1].lower()
        columns.setdefault(table, set())
        for part in split_top_level(table_body(sql, match.end())):
            name = part.split()[0].lower()
            if name not in {'constraint', 'primary', 'foreign', 'unique', 'check', 'exclude'}:
                columns[table].add(name)
    for match in re.finditer(r'alter\s+table\s+' + IDENT + r'([\s\S]*?);', sql, re.I):
        for name in re.findall(r'add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z_0-9]*)', match[2], re.I):
            columns.setdefault(match[1].lower(), set()).add(name.lower())
    def names(pattern: str) -> list[str]:
        return sorted({m[1].lower() for m in re.finditer(pattern, sql, re.I)})
    policies = [dict(name=m[1], table=m[2].lower()) for m in re.finditer(r'create\s+policy\s+"([^"]+)"\s+on\s+' + IDENT, sql, re.I)]
    return {
        'columns': {key: sorted(value) for key, value in sorted(columns.items())},
        'functions': names(r'create\s+(?:or\s+replace\s+)?function\s+' + IDENT),
        'indexes': names(r'create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?' + IDENT),
        'policies': policies,
        'grants_and_revokes': [' '.join(m[0].split()) for m in re.finditer(r'\b(?:grant|revoke)\s+[^;]+;', sql, re.I)],
    }


def audit(sql_dir: Path, snapshot: dict) -> dict:
    files = sorted(p for p in sql_dir.glob('*.sql') if re.match(r'(0[6-9]|1[0-9]|2[0-4])_', p.name))
    tables = {r['name'] for r in snapshot['tables']}
    live_columns = {(r['table'], r['name']) for r in snapshot['columns']}
    functions = {r['name'] for r in snapshot['functions']}
    indexes = {r['name'] for r in snapshot['indexes']}
    policies = {(r['tablename'], r['policyname']) for r in snapshot['policies']}
    records = []
    for path in files:
        source = path.read_text(encoding='utf-8')
        found = declarations(source)
        records.append({
            'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'declarations': found,
            'missing_tables': sorted(set(found['columns']) - tables),
            'missing_columns': [f'{t}.{c}' for t, cols in found['columns'].items() for c in cols if (t, c) not in live_columns],
            'missing_function_names': sorted(set(found['functions']) - functions),
            'missing_index_names': sorted(set(found['indexes']) - indexes),
            'missing_policy_names': [f"{p['table']}.{p['name']}" for p in found['policies'] if (p['table'], p['name']) not in policies],
        })
    return {
        'scope': 'SQL06-24 declaration presence only; superseded declarations may be intentionally absent',
        'not_verified': ['column type/typmod/default equivalence', 'FK action equivalence', 'index expression equivalence', 'RPC signature/body equivalence', 'policy expression equivalence', 'effective inherited/column grants', 'Data API exposed schemas and actual role requests'],
        'migration_count': len(records),
        'files': records,
        'live_foreign_keys': [c for c in snapshot['constraints'] if c['type'] == 'f'],
        'live_rls_off_tables': [t['name'] for t in snapshot['tables'] if t['kind'] in ('r', 'p') and not t['rls']],
        'authenticated_definer_functions': [f['name'] for f in snapshot['functions'] if f['security_definer'] and f['authenticated_execute']],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, default=PROJECT / 'docs/research/audit2/live_catalog_20261006.json')
    parser.add_argument('--sql-dir', type=Path, default=PROJECT / 'sql')
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding='utf-8'))
    print(json.dumps(audit(args.sql_dir, snapshot), ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
