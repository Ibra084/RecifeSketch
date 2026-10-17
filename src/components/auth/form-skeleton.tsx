/** Static placeholder while a form that reads the URL streams in. */
export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-3.5">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="mx-1 h-3.5 w-28 rounded bg-gray-100" />
          <div className="h-[50px] rounded-2xl bg-gray-100/80" />
        </div>
      ))}
      <div className="mt-1 h-[44px] rounded-xl bg-blue-100" />
    </div>
  )
}
