import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/exam-session/$id')({
  component: ExamSession,
})

function ExamSession() {
  const { id } = Route.useParams()
  return <div className="p-4">Exam Session Page for exam: {id}</div>
}
