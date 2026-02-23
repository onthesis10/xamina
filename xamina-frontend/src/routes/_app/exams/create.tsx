import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/exams/create')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_app/exams/create"!</div>
}
