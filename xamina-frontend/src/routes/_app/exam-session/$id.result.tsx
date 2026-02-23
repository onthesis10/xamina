import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/exam-session/$id/result')({
    component: ExamResult,
})

function ExamResult() {
    const { id } = Route.useParams()
    return <div className="p-4">Exam Result Page for exam: {id}</div>
}
