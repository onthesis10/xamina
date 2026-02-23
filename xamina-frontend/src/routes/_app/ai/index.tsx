import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/ai/')({
    component: AI,
})

function AI() {
    return <div className="p-4">AI Evaluator Dashboard</div>
}
