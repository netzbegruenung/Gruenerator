import { Skeleton } from '@/components/ui/skeleton'

const ThemeCardSkeleton = () => (
    <div className="rounded-xl border w-[305px] bg-white border-[#EDEEEF]">
        <div className="relative h-[250px] flex justify-center items-center">
            <img src="/card_bg.svg" alt="" className="absolute top-0 z-[1] left-0 w-[99%] h-full object-cover" />
            <div className="absolute top-0 left-0 flex items-center gap-2 z-[2] p-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="relative z-[3] px-6 w-full">
                <div className="w-full h-[135px] rounded-xl overflow-hidden">
                    <Skeleton className="w-full h-full" />
                </div>
            </div>
        </div>
        <div className="px-5 border-t rounded-b-xl border-[#EDEEEF] w-full py-2.5 h-[80px] bg-white flex items-center justify-between">
            <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <div className="flex items-center gap-1">
                    <Skeleton className="w-4 h-4 rounded-full" />
                    <Skeleton className="w-4 h-4 rounded-full" />
                </div>
            </div>
            <Skeleton className="h-5 w-5" />
        </div>
    </div>
)

const Loading = () => {
    return (
        <div className="space-y-6 px-6 font-syne">
            <div className="py-[28px] flex justify-between">
                <Skeleton className="h-[34px] w-[140px] rounded-lg" />
                <Skeleton className="h-[42px] w-[140px] rounded-[48px]" />
            </div>

            <div className="p-1 rounded-[40px] bg-[#F7F6F9] w-fit border border-[#F4F4F4] flex items-center justify-center">
                <Skeleton className="h-8 w-20 rounded-[70px]" />
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-1" width="2" height="17" viewBox="0 0 2 17" fill="none">
                    <path d="M1 0V16.5" stroke="#EDECEC" strokeWidth="2" />
                </svg>
                <Skeleton className="h-8 w-20 rounded-[70px]" />
            </div>

            <div className="flex flex-wrap gap-6">
                {Array.from({ length: 4 }).map((_, idx) => (
                    <ThemeCardSkeleton key={idx} />
                ))}
            </div>
        </div>
    )
}

export default Loading
