const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';

// Create test_output directory if it doesn't exist
const outputDir = path.join(__dirname, 'test_output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

async function testInfoCanvas() {
  console.log('🧪 Starting Info Canvas Tests...\n');

  const testCases = [
    {
      name: 'Basic Info Test - Standard Text',
      data: {
        header: 'Unsere Partei möchte Vorreiter*in für Gleichstellung sein!',
        body: 'Bündnis 90/Die Grünen ist die erste Partei in Deutschland mit verbindlicher Frauenquote. Seit 1986 regelt das grüne Frauenstatut: Mindestens 50 % aller Ämter und Mandate für Frauen! Platz 1 auf Listen ist immer für eine Frau reserviert für echte Gleichstellung in der Politik.'
      }
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`📝 Test ${i + 1}/${totalTests}: ${testCase.name}`);
    
    try {
      const form = new FormData();
      
      // Convert all form data to strings to avoid FormData errors
      Object.keys(testCase.data).forEach(key => {
        form.append(key, String(testCase.data[key]));
      });

      const response = await axios.post(`${BASE_URL}/api/info_canvas`, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000
      });

      if (response.status === 200 && response.data.image) {
        console.log(`✅ Test ${i + 1} PASSED - Image generated successfully`);
        console.log(`   📊 Response size: ${response.data.image.length} characters`);
        
        // Basic validation of base64 image format
        if (response.data.image.startsWith('data:image/png;base64,')) {
          console.log(`   ✅ Valid base64 PNG format`);
          
          // Save the image to test_output folder
          const base64Data = response.data.image.replace(/^data:image\/png;base64,/, '');
          const filename = `info_test_${i + 1}_${testCase.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
          const filepath = path.join(outputDir, filename);
          
          try {
            fs.writeFileSync(filepath, base64Data, 'base64');
            console.log(`   💾 Image saved to: test_output/${filename}`);
          } catch (saveError) {
            console.log(`   ⚠️  Failed to save image: ${saveError.message}`);
          }
        } else {
          console.log(`   ⚠️  Unexpected image format`);
        }
        
        passedTests++;
      } else {
        console.log(`❌ Test ${i + 1} FAILED - Invalid response format`);
        console.log(`   Response status: ${response.status}`);
        console.log(`   Response data:`, response.data);
      }
    } catch (error) {
      console.log(`❌ Test ${i + 1} FAILED - Error: ${error.message}`);
      
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Error data:`, error.response.data);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`   ⚠️  Server not running? Check if backend is started on ${BASE_URL}`);
      }
    }
    
    console.log(); // Empty line for readability
  }

  console.log(`🏁 Info Canvas Test Results:`);
  console.log(`   ✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`   ❌ Failed: ${totalTests - passedTests}/${totalTests}`);
  console.log(`   📊 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log(`\n🎉 All info canvas tests passed! The implementation is working correctly.`);
  } else {
    console.log(`\n⚠️  Some tests failed. Check the error messages above for details.`);
  }
}

// Run the tests
testInfoCanvas().catch(console.error);