import React from 'react'
const SettingSideBar = ({ mode, setMode, selectedProvider, setSelectedProvider }: { mode: 'nanobanana' | 'presenton', setMode: (mode: 'nanobanana' | 'presenton') => void, selectedProvider: 'text-provider' | 'image-provider', setSelectedProvider: (provider: 'text-provider' | 'image-provider') => void }) => {
    return (
        <div className='w-full max-w-[230px] h-screen px-4 pt-[22px] bg-[#F9FAFB]'>
            <p className='text-xs text-black  font-medium border-b mt-[3.15rem]  border-[#E1E1E5] pb-3.5'>FILTER BY:</p>
            <div className='mt-6'>
                <p className='text-[#3A3A3A] text-xs font-medium pb-2.5'>Select Mode</p>
                <div className='p-1 rounded-[40px] bg-[#ffffff] w-fit border border-[#EDEEEF] flex items-center justify-center mb-[34px] '>
                    <button className='px-3  py-2 text-xs font-medium text-[#3A3A3A] rounded-[70px]'
                        onClick={() => setMode('presenton')}
                        style={{
                            background: mode === 'presenton' ? '#F4F3FF' : 'transparent',
                            color: mode === 'presenton' ? '#5146E5' : '#3A3A3A'
                        }}
                    >Presenton</button>
                    <svg xmlns="http://www.w3.org/2000/svg" className='mx-1' width="2" height="17" viewBox="0 0 2 17" fill="none">
                        <path d="M1 0V16.5" stroke="#EDECEC" strokeWidth="2" />
                    </svg>
                    <div className='relative'>
                        <button className='px-3  py-2 text-xs font-medium rounded-[70px] cursor-not-allowed opacity-60'
                            disabled
                            style={{
                                background: 'transparent',
                                color: '#9CA3AF'
                            }}
                        >
                            Nanobanana
                        </button>
                        <span className='absolute -top-2 -right-5 text-[7px] uppercase tracking-wide bg-[#F4F3FF] text-[#5146E5] border border-[#D9D6FE] rounded-full px-1.5 py-0.5 whitespace-nowrap'>
                            Coming soon
                        </span>
                    </div>


                </div>
                <p className='text-[#3A3A3A] text-xs font-medium pb-2.5'>Select Provider</p>
                {mode === 'presenton' && <div className='space-y-2.5'>
                    <button className={` w-full rounded-[6px] p-3 py-4 flex items-center gap-1.5 border  ${selectedProvider === 'text-provider' ? 'bg-[#F4F3FF] border-[#D9D6FE]' : 'bg-white border-[#E1E1E5]'}`} onClick={() => setSelectedProvider('text-provider')}>
                        <div className='relative w-6 h-6 rounded-full overflow-hidden border border-[#EDEEEF]'>

                            <img src='/providers/openai.png' className=' object-cover w-full h-full overflow-hidden' alt='google' />
                        </div>
                        <p className='text-[#191919] text-xs  font-medium' >Text Provider</p>
                    </button>
                    <button className={` w-full rounded-[6px] p-3 py-4 flex items-center gap-1.5 border  ${selectedProvider === 'image-provider' ? 'bg-[#F4F3FF] border-[#D9D6FE]' : 'bg-white border-[#E1E1E5]'}`} onClick={() => setSelectedProvider('image-provider')}>
                        <div className='relative w-6 h-6 rounded-full overflow-hidden border border-[#EDEEEF]'>
                            <img src='/providers/image-provider.png' className=' object-cover w-full h-full overflow-hidden' alt='google' />
                        </div>
                        <p className='text-[#191919] text-xs  font-medium' >Image Provider</p>
                    </button>
                </div>}
                {
                    mode === 'nanobanana' && <div>
                        <button className={` w-full rounded-[6px] p-3 py-4 flex items-center gap-1.5 border  bg-[#F4F3FF] border-[#D9D6FE]`}>
                            <div className='relative w-6 h-6 rounded-full overflow-hidden border border-[#EDEEEF]'>

                                <img src='/providers/openai.png' className=' object-cover w-full h-full overflow-hidden' alt='google' />
                            </div>
                            <p className='text-[#191919] text-xs  font-medium' >Nanobanana</p>
                        </button>
                    </div>
                }
            </div>
        </div>
    )
}

export default SettingSideBar
