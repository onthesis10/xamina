import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/settings/')({
    component: Settings,
})

function Settings() {
    return <div className="p-4">Settings Page</div>
}
