import React from 'react';
import { AbsoluteFill, Sequence, staticFile } from 'remotion';
import Scene1PromptInput from './scenes/Scene1PromptInput';
import Scene2ResultCard from './scenes/Scene2ResultCard';
import Scene3ServusAustria from './scenes/Scene3ServusAustria';
import Scene5Europe from './scenes/Scene5Europe';
import Scene6Logo from './scenes/Scene6Logo';

const fontFaceCSS = `
@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap');

@font-face {
  font-family: 'GrueneTypeNeue';
  src: url('${staticFile('fonts/GrueneTypeNeue-Regular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'GrueneType Neue';
  src: url('${staticFile('fonts/GrueneTypeNeue-Regular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'PTSans';
  src: url('${staticFile('fonts/PTSans-Regular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'PT Sans';
  src: url('${staticFile('fonts/PTSans-Regular.ttf')}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'PTSans';
  src: url('${staticFile('fonts/PTSans-Bold.ttf')}') format('truetype');
  font-weight: bold;
  font-style: normal;
}
`;

const AustriaLaunchComposition = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#F0F8F4',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: fontFaceCSS }} />

      <Sequence from={0} durationInFrames={144} name="Scene 1: Typing">
        <Scene1PromptInput />
      </Sequence>

      <Sequence from={144} durationInFrames={120} name="Scene 2: Result">
        <Scene2ResultCard />
      </Sequence>

      <Sequence from={264} durationInFrames={106} name="Scene 3: Servus Austria">
        <Scene3ServusAustria />
      </Sequence>

      <Sequence from={370} durationInFrames={120} name="Scene 5: Europe">
        <Scene5Europe />
      </Sequence>

      <Sequence from={490} durationInFrames={96} name="Scene 6: Logo">
        <Scene6Logo />
      </Sequence>
    </AbsoluteFill>
  );
};

export default AustriaLaunchComposition;
