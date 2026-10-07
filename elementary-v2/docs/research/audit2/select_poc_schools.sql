-- Read-only public school candidate selection. Not a migration.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
WITH eligible AS (
select s.school_id,s.schoolinfo_code,s.school_name,s.region,s.road_address,s.homepage,s.grade1_students,s.grade1_classes,s.student_statistics_year,
r.neis_office_code,
case when s.region='경기도' and s.road_address like '%성남시 분당구%' then 'dense_development'
when s.region='서울특별시' then 'seoul_holdout'
when s.region='인천광역시' then 'incheon_holdout'
when s.region='부산광역시' then 'busan_coverage'
when s.region='전라남도' then 'jeonnam_coverage' end as stratum
from public.school_master s join public.region_registry r on r.canonical_name=s.region
where s.school_type='초등학교' and s.operation_status='운영'
), ranked AS (
select *,row_number() over(partition by stratum order by md5(school_id||'audit2-poc-20261006'),school_id) as selection_rank,
count(*) over(partition by stratum) as eligible_stratum_count from eligible where stratum is not null
)
select * from ranked where selection_rank <= case when stratum='dense_development' then 20 else 10 end
order by stratum,selection_rank;
ROLLBACK;
