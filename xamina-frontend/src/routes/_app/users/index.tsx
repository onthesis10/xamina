import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/users/')({
    component: Users,
})

function Users() {
    return <div className="p-4">Users Management</div>
}
