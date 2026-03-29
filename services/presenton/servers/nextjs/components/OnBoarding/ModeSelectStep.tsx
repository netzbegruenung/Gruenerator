import { ChevronRight } from 'lucide-react'
import React from 'react'

const ModeSelectStep = ({ setStep, setSelectedMode }: { setStep: (step: number) => void, setSelectedMode: (mode: string) => void }) => {
    return (
        <div className='max-w-[650px]'>
            <div className='mb-[70px]'>

                <h2 className='mb-4 text-black text-[26px] font-normal font-unbounded '>Richte deinen KI-Arbeitsbereich ein</h2>
                <p className='text-[#000000CC] text-xl font-normal font-syne'>Wähle die KI für deine Präsentationserstellung.</p>
            </div>
            <div className='space-y-5'>
                <div onClick={() => {
                    setSelectedMode("presenton")
                    setStep(2)
                }} className='border font-syne border-[#EDEEEF] rounded-[11px] p-3  flex items-center  justify-between gap-6 cursor-pointer'>
                    <div className='flex items-center gap-6'>
                        <div className='rounded-[4px] bg-[#F0F8F4]  p-[12px] w-[58px] h-[58px] flex items-center justify-center'>
                            <img src='/logo-with-bg.png' alt='Grünerator Slides' className='w-full h-full object-contain' />
                        </div>
                        <div className=''>
                            <div className='flex items-start gap-2 relative '>

                                <h3 className='text-black text-[18px] font-medium font-syne'>Grünerator Slides</h3>
                                <p className='bg-[#F0F8F4] px-3 py-1.5 rounded-[30px] text-[#52907A] text-[9px] absolute left-[95px] top-[-10px]'>PPTX</p>
                            </div>
                            <p className='text-[#999999] text-[14px] font-normal font-syne'>Optimiert für schnelle, strukturierte Folienerstellung.</p>
                        </div>
                    </div>
                    <ChevronRight className='w-6 h-6 text-[#B3B3B3]' />
                </div>
                <div

                    // onClick={() => {
                    //     setSelectedMode("image")
                    //     setStep(2)
                    // }}
                    className='border font-syne border-[#EDEEEF]  cursor-not-allowed rounded-[11px] p-3  flex items-center  justify-between gap-6  relative'>
                    <p className='text-black absolute top-1/2 -translate-y-1/2 right-14 flex items-center justify-center text-[14px] font-normal bg-[#F0F8F4] px-3 py-1.5 rounded-[30px]'>Demnächst verfügbar</p>

                    <div className='flex items-center gap-6'>
                        <div className='rounded-[4px] bg-[#FFF6ED]  p-[12px] w-[58px] h-[58px] flex items-center justify-center'>
                            <img src='/image_mode.png' alt='Grünerator Slides' className='w-full h-full object-contain' />
                        </div>
                        <div className=''>
                            <div className='flex items-start gap-2 relative '>

                                <h3 className='text-black text-[18px] font-medium font-syne'>Mit Bildmodell erstellen</h3>

                            </div>
                            <p className='text-[#999999] text-[14px] font-normal font-syne'>Präsentationen mit visuellen Layouts erstellen.</p>
                        </div>
                    </div>
                    <ChevronRight className='w-6 h-6 text-[#B3B3B3]' />
                </div>
            </div>
        </div>
    )
}

export default ModeSelectStep
