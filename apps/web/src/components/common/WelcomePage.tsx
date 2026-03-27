import { useRef } from 'react';

import type { JSX } from 'react';
interface WelcomePageProps {
  title: string;
  description: string;
  stepsTitle: string;
  steps: {
    title?: string;
    description?: string;
  }[];
  onStart: () => void;
}

const WelcomePage = ({
  title,
  description,
  steps,
  onStart,
  stepsTitle,
}: WelcomePageProps): JSX.Element => {
  const screenRef = useRef<HTMLDivElement>(null);

  const handleStart = () => {
    if (screenRef.current) {
      screenRef.current.style.opacity = '0';
      screenRef.current.style.pointerEvents = 'none';
      screenRef.current.style.transform = 'translateY(-20px)';
    }
    setTimeout(() => {
      window.scrollTo(0, 0);
      onStart();
    }, 500);
  };

  return (
    <div
      ref={screenRef}
      className="min-h-[calc(100vh-300px)] max-md:min-h-[calc(100vh-120px)] max-[600px]:min-h-auto w-full bg-background flex justify-start items-start px-5 max-md:px-[15px] max-[480px]:px-2.5 -mt-10 max-md:mt-0 relative transition-[opacity,transform] duration-500 ease-out"
      style={{
        backgroundImage:
          'radial-gradient(circle at 5% 10%, var(--klee-transparent) 0%, transparent 15%), radial-gradient(circle at 95% 90%, var(--primary-transparent) 0%, transparent 12%), radial-gradient(circle at 90% 5%, var(--secondary-transparent) 0%, transparent 8%)',
      }}
    >
      <div className="max-w-[1200px] w-full text-left p-[0_40px_40px] max-md:p-5 max-[480px]:p-[15px_10px] mx-auto relative bg-gradient-to-br from-background to-background-alt rounded-[20px] shadow-[0_12px_40px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] border border-[var(--button-hover-color)]">
        <h1 className="text-[clamp(2em,4vw,2.8em)] text-foreground-heading mb-[30px] font-bold p-[30px_clamp(20px,4vw,40px)_0] relative">
          {title}
        </h1>
        <p className="text-[clamp(1em,2vw,1.2em)] leading-[1.6] text-foreground max-w-[min(1000px,90%)] ml-[clamp(20px,4vw,40px)] mb-10 px-[25px] py-5 border-l-[3px] border-l-[var(--klee)] bg-background-alt rounded-r-2xl shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
          {description}
        </p>

        <div className="my-[clamp(20px,4vw,40px)] relative p-5 bg-gradient-to-br from-background-alt to-transparent rounded-2xl">
          <h2 className="text-[clamp(1.4em,3vw,1.8em)] text-foreground-heading mb-[clamp(30px,3vw,40px)] pl-[clamp(20px,4vw,40px)] relative">
            {stepsTitle}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] max-[600px]:grid-cols-[repeat(3,1fr)] gap-[clamp(20px,3vw,30px)] max-[480px]:gap-[25px] mx-auto max-w-[min(1000px,90%)] px-[clamp(10px,2vw,20px)] max-md:px-2.5 relative">
            {steps.map((step, index) => (
              <div
                key={index}
                className="p-[clamp(25px,3vw,30px)_clamp(20px,2vw,25px)] rounded-2xl relative transition-all duration-400 ease-in-out border border-[var(--button-hover-color)] h-full flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)] bg-gradient-to-br from-background to-background-alt hover:from-background-alt hover:to-background hover:translate-y-[-4px] hover:scale-[1.02] hover:shadow-[0_16px_32px_rgba(0,0,0,0.1),0_4px_12px_rgba(0,0,0,0.05)] hover:border-[var(--klee)] max-md:mt-[15px]"
              >
                <div className="w-[clamp(32px,4vw,36px)] h-[clamp(32px,4vw,36px)] bg-gradient-to-br from-[var(--klee)] to-[var(--primary)] text-white rounded-full flex items-center justify-center text-[clamp(1.1em,2vw,1.3em)] font-bold absolute -top-[18px] left-5 shadow-[0_4px_8px_rgba(0,0,0,0.1)]">
                  {index + 1}
                </div>
                <h3 className="text-foreground-heading text-[clamp(1.1em,2vw,1.2em)] mt-[15px] mb-3">
                  {step.title}
                </h3>
                <p className="text-foreground leading-[1.5] text-[clamp(0.9em,1.5vw,0.95em)] opacity-90 grow">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <button
          className="bg-gradient-to-br from-[var(--klee)] to-[var(--primary)] text-white border-none p-[clamp(14px,2vw,16px)_clamp(35px,4vw,40px)] rounded-[30px] text-[clamp(1.1em,2vw,1.3em)] font-bold cursor-pointer transition-all duration-400 ease-in-out mt-[clamp(30px,4vw,40px)] mx-auto mb-0 shadow-[0_6px_20px_rgba(0,0,0,0.1)] block w-fit min-w-[min(250px,80%)] relative overflow-hidden hover:translate-y-[-2px] hover:scale-[1.02] hover:shadow-[0_8px_25px_rgba(0,0,0,0.15)] hover:bg-gradient-to-br hover:from-[var(--primary)] hover:to-[var(--klee)]"
          onClick={handleStart}
        >
          Los geht&apos;s!
        </button>
      </div>
    </div>
  );
};

export default WelcomePage;
