import React from 'react'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { School } from '../../types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface GradeChartProps {
  school: School
  className?: string
}

const GradeChart: React.FC<GradeChartProps> = ({ school, className = '' }) => {
  const [chartType, setChartType] = React.useState<'students' | 'perClass'>('students')
  const grades = Array.from({ length: 6 }, (_, index) => {
    const grade = index + 1
    return {
      grade,
      students: Number(school[`grade${grade}_students` as keyof School]) || 0,
      classes: Number(school[`grade${grade}_classes` as keyof School]) || 0,
      perClass: Number(school[`grade${grade}_per_class` as keyof School]) || 0,
    }
  })
  const values = grades.map((grade) => chartType === 'students'
    ? grade.students
    : grade.perClass || (grade.classes ? Math.round(grade.students / grade.classes * 10) / 10 : 0))

  const data: ChartData<'bar'> = {
    labels: grades.map(({ grade }) => `${grade}학년`),
    datasets: [{
      label: chartType === 'students' ? '학생 수' : '학급당 학생 수',
      data: values,
      backgroundColor: grades.map(({ grade }) => grade === 1 ? '#2563eb' : '#93c5fd'),
      borderRadius: 3,
      borderSkipped: false,
    }],
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ({ parsed }) => `${parsed.y}명`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#e5e7eb' } },
    },
    animation: { duration: 350 },
  }

  if (!values.some((value) => value > 0)) {
    return <div className={`border-y border-gray-200 py-8 text-center text-sm text-gray-500 ${className}`}>학년별 통계가 아직 없습니다.</div>
  }

  return (
    <div className={className}>
      <div className="mb-3 inline-flex rounded-md border border-gray-200 p-1" aria-label="차트 지표">
        <button
          type="button"
          onClick={() => setChartType('students')}
          aria-pressed={chartType === 'students'}
          className={`rounded px-3 py-1 text-xs font-medium ${chartType === 'students' ? 'bg-blue-50 text-blue-800' : 'text-gray-600'}`}
        >
          학생 수
        </button>
        <button
          type="button"
          onClick={() => setChartType('perClass')}
          aria-pressed={chartType === 'perClass'}
          className={`rounded px-3 py-1 text-xs font-medium ${chartType === 'perClass' ? 'bg-blue-50 text-blue-800' : 'text-gray-600'}`}
        >
          학급당 학생 수
        </button>
      </div>
      <div className="h-48">
        <Bar data={data} options={options} />
      </div>
    </div>
  )
}

export default GradeChart
