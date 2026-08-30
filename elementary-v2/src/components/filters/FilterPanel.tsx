import { useFilters } from '../../contexts/AppContext'
import type { FilterState } from '../../types'
import { UNLIMITED_APARTMENT_AGE } from '../../types'

export default function FilterPanel() {
  const { filters, setFilter, resetFilters } = useFilters()

  return (
    <div className="p-4 space-y-6">
      {/* 필터 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">필터</h2>
        <button
          onClick={resetFilters}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          초기화
        </button>
      </div>

      {/* 학교 필터 섹션 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b pb-2">학교 조건</h3>
        
        {/* 기준 학년 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            기준 학년
          </label>
          <select
            value={filters.target_grade}
            onChange={(e) => setFilter({ target_grade: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[1, 2, 3, 4, 5, 6].map(grade => (
              <option key={grade} value={grade}>{grade}학년</option>
            ))}
          </select>
        </div>

        {/* 최소 학생수 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            최소 학생수: {filters.min_students}명
          </label>
          <input
            type="range"
            min="0"
            max="200"
            step="10"
            value={filters.min_students}
            onChange={(e) => setFilter({ min_students: Number(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0명</span>
            <span>200명</span>
          </div>
        </div>

        {/* 학교 유형 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            학교 유형
          </label>
          <div className="space-y-2">
            {[
              { value: 'public', label: '공립' },
              { value: 'private', label: '사립' },
              { value: 'national', label: '국립' }
            ].map(({ value, label }) => {
              const schoolType = value as FilterState['school_types'][number]
              return (
              <label key={value} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.school_types.includes(schoolType)}
                  onChange={(e) => {
                    const types = e.target.checked
                      ? [...filters.school_types, schoolType]
                      : filters.school_types.filter(t => t !== value)
                    setFilter({ school_types: types })
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
              )
            })}
          </div>
        </div>
      </div>

      {/* 아파트 필터 섹션 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b pb-2">아파트 조건</h3>
        
        {/* 주차 비율 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            최소 주차비율: {filters.min_parking_ratio}대/세대
          </label>
          <input
            type="range"
            min="0"
            max="1.2"
            step="0.1"
            value={filters.min_parking_ratio}
            onChange={(e) => setFilter({ min_parking_ratio: Number(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0</span>
            <span>1.2</span>
          </div>
        </div>

        {/* 최대 연식 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            최대 연식: {filters.max_apartment_age === UNLIMITED_APARTMENT_AGE ? '제한없음' : `${filters.max_apartment_age}년`}
          </label>
          <select
            value={filters.max_apartment_age}
            onChange={(e) => setFilter({ max_apartment_age: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[5, 10, 15, 20, 25, 30, 40, 50].map((age) => (
              <option key={age} value={age}>{age}년 이하</option>
            ))}
            <option value={UNLIMITED_APARTMENT_AGE}>제한없음</option>
          </select>
        </div>

        {/* 공공임대 비율 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            최대 공공임대 비율: {filters.max_public_rental_ratio === 100 ? '제한없음' : `${filters.max_public_rental_ratio}%`}
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={filters.max_public_rental_ratio}
            onChange={(e) => setFilter({ max_public_rental_ratio: Number(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0%</span>
            <span>제한없음</span>
          </div>
        </div>

        {/* 최소 세대수 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            최소 세대수: {filters.min_households}세대
          </label>
          <input
            type="range"
            min="0"
            max="1000"
            step="50"
            value={filters.min_households}
            onChange={(e) => setFilter({ min_households: Number(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0</span>
            <span>1000+</span>
          </div>
        </div>
      </div>

      {/* 적용된 필터 요약 */}
      <div className="pt-4 border-t">
        <h4 className="text-sm font-medium text-gray-600 mb-2">적용된 조건</h4>
        <div className="text-xs text-gray-500 space-y-1">
          <div>{filters.target_grade}학년 기준 {filters.min_students}명 이상</div>
          <div>주차 {filters.min_parking_ratio}대/세대 이상</div>
          <div>연식 {filters.max_apartment_age === UNLIMITED_APARTMENT_AGE ? '제한없음' : `${filters.max_apartment_age}년 이하`}</div>
          <div>{filters.min_households}세대 이상</div>
        </div>
      </div>
    </div>
  )
}
