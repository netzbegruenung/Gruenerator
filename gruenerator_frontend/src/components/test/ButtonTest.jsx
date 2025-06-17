import { useState } from 'react';
import SubmitButton from '../common/SubmitButton';
import { HiCheck, HiRefresh } from 'react-icons/hi';

const ButtonTest = () => {
  const [loadingStates, setLoadingStates] = useState({
    basic: false,
    withIcon: false,
    withStatus: false,
    success: false
  });

  const handleButtonClick = (buttonType) => {
    setLoadingStates(prev => ({ ...prev, [buttonType]: true }));
    
    // Simulate loading for 5 seconds to see the animation
    setTimeout(() => {
      setLoadingStates(prev => ({ ...prev, [buttonType]: false }));
      if (buttonType === 'success') {
        setLoadingStates(prev => ({ ...prev, success: false }));
      }
    }, 5000);
  };

  const handleSuccessButton = () => {
    setLoadingStates(prev => ({ ...prev, success: true }));
    
    setTimeout(() => {
      setLoadingStates(prev => ({ ...prev, success: false }));
    }, 3000);
  };

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '800px', 
      margin: '0 auto',
      background: 'var(--background-color)',
      minHeight: '100vh'
    }}>
      <h1 style={{ 
        color: 'var(--font-color)', 
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        SubmitButton Animation Test
      </h1>
      
      <div style={{ 
        display: 'grid', 
        gap: '2rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'
      }}>
        
        {/* Basic Button */}
        <div style={{ 
          padding: '1.5rem', 
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          background: 'var(--background-color-alt)'
        }}>
          <h3 style={{ color: 'var(--font-color)', marginBottom: '1rem' }}>
            Basic Loading Animation
          </h3>
          <SubmitButton
            text="Generate Text"
            onClick={() => handleButtonClick('basic')}
            loading={loadingStates.basic}
            statusMessage="Generating..."
          />
          <p style={{ 
            color: 'var(--font-color)', 
            fontSize: '0.9em', 
            marginTop: '0.5rem',
            opacity: 0.7
          }}>
            Click to see 5 seconds of smooth animation
          </p>
        </div>

        {/* Button with Icon */}
        <div style={{ 
          padding: '1.5rem', 
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          background: 'var(--background-color-alt)'
        }}>
          <h3 style={{ color: 'var(--font-color)', marginBottom: '1rem' }}>
            With Icon
          </h3>
          <SubmitButton
            text="Process Data"
            icon={<HiRefresh />}
            onClick={() => handleButtonClick('withIcon')}
            loading={loadingStates.withIcon}
            statusMessage="Processing..."
          />
        </div>

        {/* Button with Status */}
        <div style={{ 
          padding: '1.5rem', 
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          background: 'var(--background-color-alt)'
        }}>
          <h3 style={{ color: 'var(--font-color)', marginBottom: '1rem' }}>
            With Status Message
          </h3>
          <SubmitButton
            text="Submit Form"
            onClick={() => handleButtonClick('withStatus')}
            loading={loadingStates.withStatus}
            statusMessage="Uploading files..."
            showStatus={true}
          />
        </div>

        {/* Success State */}
        <div style={{ 
          padding: '1.5rem', 
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          background: 'var(--background-color-alt)'
        }}>
          <h3 style={{ color: 'var(--font-color)', marginBottom: '1rem' }}>
            Success State
          </h3>
          <SubmitButton
            text="Save Changes"
            icon={<HiCheck />}
            onClick={handleSuccessButton}
            success={loadingStates.success}
          />
        </div>

      </div>

      {/* Animation Description */}
      <div style={{ 
        marginTop: '3rem', 
        padding: '2rem',
        background: 'var(--background-color-alt)',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)'
      }}>
        <h3 style={{ color: 'var(--font-color)', marginBottom: '1rem' }}>
          Animation Details
        </h3>
        <div style={{ color: 'var(--font-color)', lineHeight: '1.6' }}>
          <p><strong>🌊 Radial Gradient Animation:</strong> The colors flow in a smooth circular pattern around the button</p>
          <p><strong>⏱️ 4 Second Cycle:</strong> Each complete animation cycle takes 4 seconds for a calm, natural rhythm</p>
          <p><strong>🎨 8 Keyframes:</strong> Multiple intermediate steps ensure buttery-smooth transitions</p>
          <p><strong>🧘 Cubic Bezier Easing:</strong> Custom easing curve [0.25, 0.46, 0.45, 0.94] for organic movement</p>
          <p><strong>♾️ Infinite Loop:</strong> Continues seamlessly while loading state is active</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ 
        marginTop: '2rem', 
        textAlign: 'center'
      }}>
        <button
          onClick={() => setLoadingStates({ basic: false, withIcon: false, withStatus: false, success: false })}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--border-subtle)',
            border: 'none',
            borderRadius: '4px',
            color: 'var(--font-color)',
            cursor: 'pointer'
          }}
        >
          Reset All Buttons
        </button>
      </div>
    </div>
  );
};

export default ButtonTest; 