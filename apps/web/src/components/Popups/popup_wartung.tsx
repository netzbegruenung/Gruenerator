const PopupWartung = () => {
  return (
    <div className="fixed inset-0 w-full h-full bg-black/70 flex justify-center items-center z-[1001] backdrop-blur-[5px] p-4 box-border overflow-y-auto cursor-default">
      <div className="bg-background p-5 rounded-xl shadow-[0_1rem_3rem_rgba(0,0,0,0.2)] max-w-[44rem] w-full m-auto animate-[fadeIn_0.5s_ease-out]">
        <div className="mb-4 text-center">
          <span className="text-5xl block mb-4">🔧</span>
          <h2 className="text-[1.3rem] mb-3 text-center text-foreground-heading font-bold">
            Wartungsarbeiten
          </h2>
          <p className="text-center mb-3 text-foreground text-[0.9rem]">
            Grünerator wird gerade gewartet und kommt zeitnah wieder.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PopupWartung;
