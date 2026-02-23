import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/analytics/')({
    component: Analytics,
})

function Analytics() {
    return <div className="p-4">Analytics Dashboard</div>
}
