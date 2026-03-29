import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

const Loading = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Skeleton className="h-9 w-48 mx-auto mb-2" />
          <Skeleton className="h-5 w-64 mx-auto" />
        </div>

        {/* Inbuilt Templates Section */}
        <section className="mb-12">
          <Skeleton className="h-6 w-40 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx} className="overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <Skeleton className="h-6 w-28" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-8 rounded-full" />
                      <Skeleton className="h-4 w-4" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-3/4 mb-4" />
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-video rounded" />
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Custom Templates Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-44 rounded-md" />
          </div>
          <div className="flex items-center justify-center py-12">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-5 w-48 ml-3" />
          </div>
        </section>
      </div>
    </div>
  )
}

export default Loading

