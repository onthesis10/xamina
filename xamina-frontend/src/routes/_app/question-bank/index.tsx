import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/question-bank/')({
    component: QuestionBank,
})

function QuestionBank() {
    return <div className="p-4">Question Bank Management</div>
}
