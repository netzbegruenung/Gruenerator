import { ipcMain, BrowserWindow } from "electron";
import * as path from "path";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

interface ElementAttributes {
  tagName: string;
  id?: string;
  className?: string;
  innerText?: string;
  opacity?: number;
  background?: {
    color?: string;
    opacity?: number;
  };
  border?: {
    color?: string;
    width?: number;
    opacity?: number;
  };
  shadow?: {
    offset?: [number, number];
    color?: string;
    opacity?: number;
    radius?: number;
    angle?: number;
    spread?: number;
    inset?: boolean;
  };
  font?: {
    name?: string;
    size?: number;
    weight?: number;
    color?: string;
    italic?: boolean;
  };
  position?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  margin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  padding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  zIndex?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  borderRadius?: number[];
  imageSrc?: string;
  objectFit?: "contain" | "cover" | "fill";
  clip?: boolean;
  overlay?: any;
  shape?: "rectangle" | "circle";
  connectorType?: any;
  textWrap?: boolean;
  should_screenshot?: boolean;
  filters?: {
    invert?: number;
    brightness?: number;
    contrast?: number;
    saturate?: number;
    hueRotate?: number;
    blur?: number;
    grayscale?: number;
    sepia?: number;
    opacity?: number;
  };
}

interface SlideAttributesResult {
  elements: ElementAttributes[];
  backgroundColor?: string;
  speakerNote?: string;
}

interface PptxSlide {
  shapes: any[];
  background?: {
    color: string;
    opacity?: number;
  };
  note?: string;
}

interface PptxPresentationModel {
  slides: PptxSlide[];
}

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function setupPresentationToPptxModelHandlers() {
  ipcMain.handle(
    "presentation-to-pptx-model",
    async (event, presentationId: string) => {
      console.log('[PPTX Export] ========================================');
      console.log('[PPTX Export] Starting PPTX export for presentation:', presentationId);
      console.log('[PPTX Export] ========================================');
      let window: BrowserWindow | null = null;

      try {
        console.log('[PPTX Export] Step 1: Getting screenshots directory...');
        const screenshotsDir = getScreenshotsDir();
        console.log('[PPTX Export] Screenshots directory:', screenshotsDir);
        
        console.log('[PPTX Export] Step 2: Creating browser window...');
        window = await createBrowserWindow(presentationId);

        console.log('[PPTX Export] Step 3: Getting slides and speaker notes...');
        const { slides, speakerNotes } = await getSlidesAndSpeakerNotes(window);
        console.log('[PPTX Export] Found', slides.length, 'slides and', speakerNotes.length, 'speaker notes');
        
        console.log('[PPTX Export] Step 4: Getting slides attributes...');
        const slides_attributes = await getSlidesAttributes(
          window,
          slides,
          screenshotsDir
        );
        console.log('[PPTX Export] Got attributes for', slides_attributes.length, 'slides');
        
        console.log('[PPTX Export] Step 5: Post-processing slides attributes...');
        await postProcessSlidesAttributes(
          window,
          slides_attributes,
          screenshotsDir,
          speakerNotes
        );
        
        console.log('[PPTX Export] Step 6: Converting to PPTX model...');
        const slides_pptx_models =
          convertElementAttributesToPptxSlides(slides_attributes);
        const presentation_pptx_model: PptxPresentationModel = {
          slides: slides_pptx_models,
        };

        console.log('[PPTX Export] Step 7: Closing browser window...');
        window.close();

        console.log('[PPTX Export] ========================================');
        console.log('[PPTX Export] Export completed successfully!');
        console.log('[PPTX Export] ========================================');
        return { success: true, data: presentation_pptx_model };
      } catch (error: any) {
        console.error('[PPTX Export] ========================================');
        console.error('[PPTX Export] Export failed with error:', error);
        console.error('[PPTX Export] ========================================');
        if (window) {
          console.log('[PPTX Export] Closing browser window due to error...');
          window.close();
        }
        return {
          success: false,
          error: error.message,
          isApiError: error instanceof ApiError,
        };
      }
    }
  );
}

async function createBrowserWindow(
  presentationId: string
): Promise<BrowserWindow> {
  console.log('[PPTX Export] Creating browser window for presentation:', presentationId);
  
  // Use the Next.js URL from environment variable
  const nextjsUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  const fastApiUrl = process.env.NEXT_PUBLIC_FAST_API || 'http://127.0.0.1:8000';
  
  console.log('[PPTX Export] Next.js URL:', nextjsUrl);
  console.log('[PPTX Export] FastAPI URL:', fastApiUrl);
  
  // Get the preload script path
  const preloadPath = path.join(__dirname, '../preloads/pptx-export.js');
  console.log('[PPTX Export] Preload script path:', preloadPath);
  console.log('[PPTX Export] Preload script exists:', fs.existsSync(preloadPath));
  
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false, // Disabled so preload can set window.env
      webSecurity: false,
      preload: preloadPath,
    },
  });
  
  const url = `${nextjsUrl}/pdf-maker?id=${presentationId}`;
  console.log('[PPTX Export] Loading URL:', url);
  await window.loadURL(url);
  console.log('[PPTX Export] URL loaded, waiting for page to finish loading...');

  // Wait for page to finish loading first
  await new Promise<void>((resolve) => {
    const checkLoadState = () => {
      if (window.webContents.isLoading()) {
        setTimeout(checkLoadState, 100);
      } else {
        console.log('[PPTX Export] Page finished loading (isLoading = false)');
        resolve();
      }
    };
    checkLoadState();
  });

  // Check readyState
  const readyState = await window.webContents.executeJavaScript('document.readyState');
  console.log('[PPTX Export] Document readyState:', readyState);

  // Check initial page state and verify environment variables
  const initialPageState = await window.webContents.executeJavaScript(`
    ({
      title: document.title,
      url: window.location.href,
      hasNextScripts: document.querySelectorAll('script[src*="next"], script[src*="_next"]').length,
      bodyChildren: document.body ? document.body.children.length : 0,
      hasWindowEnv: !!window.env,
      fastApiUrl: window.env ? window.env.NEXT_PUBLIC_FAST_API : 'not set'
    })
  `);
  console.log('[PPTX Export] Initial page state:', initialPageState);

  // Wait for Next.js to finish loading (check for __NEXT_DATA__ or hydration)
  console.log('[PPTX Export] Waiting for Next.js to finish loading...');
  try {
    await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 50; // 10 seconds
        
        const checkNextJS = () => {
          attempts++;
          const hasNextData = !!window.__NEXT_DATA__;
          const hasHydrated = document.body && document.body.getAttribute('data-reactroot') !== null;
          const scriptsLoaded = document.querySelectorAll('script[src*="_next"]').length > 0;
          
          if (hasNextData || hasHydrated || scriptsLoaded || attempts >= maxAttempts) {
            console.log('[PPTX Export] Next.js check complete: hasNextData=' + hasNextData + ', hasHydrated=' + hasHydrated + ', scriptsLoaded=' + scriptsLoaded + ', attempts=' + attempts);
            resolve();
            return;
          }
          
          setTimeout(checkNextJS, 200);
        };
        
        checkNextJS();
      });
    `);
  } catch (e) {
    console.warn('[PPTX Export] Error checking Next.js state:', e);
  }

  // Wait for page to be fully loaded and slides wrapper to be ready
  console.log('[PPTX Export] Starting to wait for presentation-slides-wrapper...');
  try {
    const waitResult = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 150; // 30 seconds with 200ms intervals
        
        const checkForElement = () => {
          attempts++;
          const wrapper = document.getElementById('presentation-slides-wrapper');
          const hasBody = !!document.body;
          const bodyChildren = document.body ? document.body.children.length : 0;
          const currentUrl = window.location.href;
          const pageTitle = document.title;
          
          if (attempts % 10 === 0 || attempts <= 5) {
            console.log('[PPTX Export] Attempt ' + attempts + ': wrapper=' + (wrapper ? 'found' : 'not found') + ', body=' + hasBody + ', bodyChildren=' + bodyChildren + ', url=' + currentUrl + ', title=' + pageTitle);
            
            // On first few attempts, log what's actually in the body
            if (attempts <= 3 && document.body) {
              const firstChild = document.body.firstElementChild;
              if (firstChild) {
                console.log('[PPTX Export] First body child: tag=' + firstChild.tagName + ', id=' + (firstChild.id || 'no-id') + ', class=' + (firstChild.className || 'no-class'));
              }
            }
          }
          
          if (wrapper) {
            // Check if it actually has slides inside
            const slides = wrapper.querySelectorAll(':scope > div > div');
            if (slides.length > 0) {
              console.log('[PPTX Export] Found presentation-slides-wrapper with ' + slides.length + ' slides after ' + attempts + ' attempts');
              resolve({ found: true, slidesCount: slides.length, attempts: attempts });
              return;
            } else {
              if (attempts % 10 === 0) {
                console.log('[PPTX Export] Wrapper found but has 0 slides');
              }
            }
          }
          
          if (attempts >= maxAttempts) {
            console.error('[PPTX Export] Timeout after ' + attempts + ' attempts. Wrapper exists:', !!document.getElementById('presentation-slides-wrapper'));
            // Get detailed DOM info for debugging
            const domInfo = {
              readyState: document.readyState,
              title: document.title,
              hasBody: !!document.body,
              bodyChildren: document.body ? document.body.children.length : 0,
              bodyHTML: document.body ? document.body.innerHTML.substring(0, 500) : 'no body',
              allIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id),
              allClasses: Array.from(document.querySelectorAll('[class]')).slice(0, 20).map(el => el.className),
              rootElement: document.documentElement ? document.documentElement.tagName : 'none',
              url: window.location.href
            };
            console.error('[PPTX Export] DOM state at timeout:', JSON.stringify(domInfo, null, 2));
            reject(new Error('Timeout waiting for presentation-slides-wrapper with slides'));
            return;
          }
          
          setTimeout(checkForElement, 200);
        };
        
        // Also use MutationObserver for faster detection
        const observer = new MutationObserver(() => {
          const wrapper = document.getElementById('presentation-slides-wrapper');
          if (wrapper) {
            const slides = wrapper.querySelectorAll(':scope > div > div');
            if (slides.length > 0) {
              console.log('[PPTX Export] MutationObserver detected slides!');
              observer.disconnect();
              resolve({ found: true, slidesCount: slides.length, attempts: attempts, viaObserver: true });
            }
          }
        });
        
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
          console.log('[PPTX Export] MutationObserver started');
        } else {
          console.warn('[PPTX Export] document.body is null, cannot start MutationObserver');
        }
        
        // Start checking
        console.log('[PPTX Export] Starting polling for presentation-slides-wrapper...');
        checkForElement();
      });
    `);
    console.log('[PPTX Export] Wait completed:', waitResult);
  } catch (error) {
    console.error('[PPTX Export] Error waiting for slides wrapper:', error);
    // Check what's actually in the DOM
    try {
      const domInfo = await window.webContents.executeJavaScript(`
        (function() {
          const body = document.body;
          const wrapper = document.getElementById('presentation-slides-wrapper');
          
          // Get all elements with common class names that might contain slides
          const possibleContainers = Array.from(document.querySelectorAll('[class*="slide"], [class*="presentation"], [class*="wrapper"]')).slice(0, 10);
          
          return {
            readyState: document.readyState,
            title: document.title,
            url: window.location.href,
            hasBody: !!body,
            bodyChildren: body ? body.children.length : 0,
            bodyFirstChild: body && body.firstElementChild ? body.firstElementChild.tagName + (body.firstElementChild.id ? '#' + body.firstElementChild.id : '') + (body.firstElementChild.className ? '.' + body.firstElementChild.className.split(' ')[0] : '') : 'none',
            hasWrapper: !!wrapper,
            wrapperChildren: wrapper ? wrapper.children.length : 0,
            allIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id).slice(0, 30),
            possibleContainers: possibleContainers.map(el => ({
              tag: el.tagName,
              id: el.id || 'no-id',
              className: el.className || 'no-class',
              children: el.children.length
            })),
            bodyHTMLPreview: body ? body.innerHTML.substring(0, 1000) : 'no body'
          };
        })()
      `);
      console.log('[PPTX Export] Detailed DOM state when error occurred:');
      console.log(JSON.stringify(domInfo, null, 2));
      
      // Also check if there are any console errors
      const consoleMessages = await window.webContents.executeJavaScript(`
        (function() {
          // This won't capture past errors, but we can check for error indicators
          return {
            hasErrorElements: document.querySelectorAll('[class*="error"], [class*="Error"]').length,
            hasLoadingElements: document.querySelectorAll('[class*="loading"], [class*="Loading"], [class*="spinner"]').length,
            hasNextScripts: document.querySelectorAll('script[src*="next"], script[src*="_next"]').length
          };
        })()
      `);
      console.log('[PPTX Export] Page indicators:', consoleMessages);
    } catch (e) {
      console.error('[PPTX Export] Could not get DOM info:', e);
    }
    // Continue anyway, we'll check in the next step
  }

  // Additional wait for images and content to load
  console.log('[PPTX Export] Additional 2 second wait for content to load...');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log('[PPTX Export] Browser window ready');

  return window;
}

function getScreenshotsDir(): string {
  const tempDir = process.env.TEMP_DIRECTORY;
  if (!tempDir) {
    throw new ApiError("TEMP_DIRECTORY environment variable not set");
  }
  const screenshotsDir = path.join(tempDir, "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  return screenshotsDir;
}

async function getSlidesAndSpeakerNotes(window: BrowserWindow) {
  try {
    console.log('[PPTX Export] Getting slides and speaker notes...');
    // Wait for webContents to be ready
    if (!window.webContents) {
      throw new ApiError('Window webContents not available');
    }
    
    // Retry logic with exponential backoff
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        // Wait a bit before each attempt (except first)
        if (attempt > 0) {
          const waitTime = 1000 * attempt;
          console.log(`[PPTX Export] Retry attempt ${attempt + 1}/5, waiting ${waitTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          console.log('[PPTX Export] First attempt to get slides...');
        }
        
        const result = await window.webContents.executeJavaScript(`
          (function() {
            try {
              console.log('[PPTX Export] Checking for presentation-slides-wrapper...');
              const slidesWrapper = document.getElementById('presentation-slides-wrapper');
              if (!slidesWrapper) {
                console.warn('[PPTX Export] presentation-slides-wrapper not found');
                return {
                  error: 'Presentation slides not found',
                  slidesCount: 0,
                  speakerNotes: []
                };
              }
              
              console.log('[PPTX Export] Found wrapper, getting speaker notes and slides...');
              const speakerNotes = Array.from(slidesWrapper.querySelectorAll('[data-speaker-note]')).map(
                (el) => el.getAttribute('data-speaker-note') || ''
              );
              
              const slides = Array.from(slidesWrapper.querySelectorAll(':scope > div > div'));
              console.log('[PPTX Export] Found ' + slides.length + ' slides and ' + speakerNotes.length + ' speaker notes');
              
              if (slides.length === 0) {
                console.warn('[PPTX Export] Wrapper found but has 0 slides');
                return {
                  error: 'No slides found in presentation-slides-wrapper',
                  slidesCount: 0,
                  speakerNotes: []
                };
              }
              
              return {
                slidesCount: slides.length,
                speakerNotes: speakerNotes
              };
            } catch (error) {
              console.error('[PPTX Export] Error in getSlidesAndSpeakerNotes:', error);
              return {
                error: error.message || String(error),
                slidesCount: 0,
                speakerNotes: []
              };
            }
          })();
        `);

        console.log('[PPTX Export] Result from attempt', attempt + 1, ':', result);

        if (result.error) {
          lastError = new ApiError(`Failed to get slides data: ${result.error}`);
          console.warn(`[PPTX Export] Attempt ${attempt + 1} failed:`, result.error);
          if (attempt < 4) {
            continue; // Retry
          }
          throw lastError;
        }

        if (!result.slidesCount || result.slidesCount === 0) {
          lastError = new ApiError('No slides found in presentation');
          console.warn(`[PPTX Export] Attempt ${attempt + 1} found 0 slides`);
          if (attempt < 4) {
            continue; // Retry
          }
          throw lastError;
        }

        console.log(`[PPTX Export] Successfully got ${result.slidesCount} slides on attempt ${attempt + 1}`);
        return {
          slides: Array(result.slidesCount)
            .fill(null)
            .map((_, i) => i),
          speakerNotes: result.speakerNotes || [],
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[PPTX Export] Attempt ${attempt + 1} threw error:`, lastError.message);
        if (attempt < 4) {
          continue; // Retry
        }
        throw lastError;
      }
    }
    
    // Should never reach here, but just in case
    throw lastError || new ApiError('Failed to get slides data after multiple attempts');
  } catch (error) {
    console.error('[PPTX Export] Error executing JavaScript in slides page:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ApiError(`Failed to get slides data: ${errorMessage}`);
  }
}

async function getSlidesAttributes(
  window: BrowserWindow,
  slides: number[],
  screenshotsDir: string
): Promise<SlideAttributesResult[]> {
  const slideAttributes: SlideAttributesResult[] = [];

  for (const slideIndex of slides) {
    const attributes = await getAllChildElementsAttributes(
      window,
      slideIndex,
      screenshotsDir
    );
    slideAttributes.push(attributes);
  }

  return slideAttributes;
}

async function getAllChildElementsAttributes(
  window: BrowserWindow,
  slideIndex: number,
  screenshotsDir: string
): Promise<SlideAttributesResult> {
  try {
    const result = await window.webContents.executeJavaScript(`
      (function() {
        try {
          const slidesWrapper = document.getElementById('presentation-slides-wrapper');
          const slides = Array.from(slidesWrapper.querySelectorAll(':scope > div > div'));
          const slide = slides[${slideIndex}];
          
          if (!slide) {
            throw new Error('Slide not found at index ' + ${slideIndex});
          }
          
          ${getElementAttributesFunction()}
          
          function getAllChildElementsAttributesRecursive(element, rootRect, depth, inheritedFont, inheritedBackground, inheritedBorderRadius, inheritedZIndex, inheritedOpacity) {
        if (!rootRect) {
          const rootAttributes = getElementAttributes(element);
          inheritedFont = rootAttributes.font;
          inheritedBackground = rootAttributes.background;
          inheritedZIndex = rootAttributes.zIndex;
          inheritedOpacity = rootAttributes.opacity;
          rootRect = {
            left: rootAttributes.position?.left ?? 0,
            top: rootAttributes.position?.top ?? 0,
            width: rootAttributes.position?.width ?? 1280,
            height: rootAttributes.position?.height ?? 720,
          };
          depth = 0;
        }
        
        const directChildren = Array.from(element.children);
        const allResults = [];
        
        for (const child of directChildren) {
          const attributes = getElementAttributes(child);
          
          if (['style', 'script', 'link', 'meta', 'path'].includes(attributes.tagName)) {
            continue;
          }
          
          if (inheritedFont && !attributes.font && attributes.innerText && attributes.innerText.trim().length > 0) {
            attributes.font = inheritedFont;
          }
          if (inheritedBackground && !attributes.background && attributes.shadow) {
            attributes.background = inheritedBackground;
          }
          if (inheritedBorderRadius && !attributes.borderRadius) {
            attributes.borderRadius = inheritedBorderRadius;
          }
          if (inheritedZIndex !== undefined && attributes.zIndex === 0) {
            attributes.zIndex = inheritedZIndex;
          }
          if (inheritedOpacity !== undefined && (attributes.opacity === undefined || attributes.opacity === 1)) {
            attributes.opacity = inheritedOpacity;
          }
          
          if (attributes.position && attributes.position.left !== undefined && attributes.position.top !== undefined) {
            attributes.position = {
              left: attributes.position.left - rootRect.left,
              top: attributes.position.top - rootRect.top,
              width: attributes.position.width,
              height: attributes.position.height,
            };
          }
          
          if (!attributes.position || !attributes.position.width || !attributes.position.height || 
              attributes.position.width === 0 || attributes.position.height === 0) {
            continue;
          }
          
          if (attributes.tagName === 'p') {
            const innerElementTagNames = Array.from(child.querySelectorAll('*')).map((e) =>
              e.tagName.toLowerCase()
            );
            
            const allowedInlineTags = new Set(['strong', 'u', 'em', 'code', 's']);
            const hasOnlyAllowedInlineTags = innerElementTagNames.every((tag) =>
              allowedInlineTags.has(tag)
            );
            
            if (innerElementTagNames.length > 0 && hasOnlyAllowedInlineTags) {
              attributes.innerText = child.innerHTML;
              allResults.push({ attributes, depth });
              continue;
            }
          }
          
          if (attributes.tagName === 'svg' || attributes.tagName === 'canvas' || attributes.tagName === 'table') {
            attributes.should_screenshot = true;
            attributes.elementIndex = allResults.length;
          }
          
          allResults.push({ attributes, depth });
          
          if (attributes.should_screenshot && attributes.tagName !== 'svg') {
            continue;
          }
          
          const childResults = getAllChildElementsAttributesRecursive(
            child,
            rootRect,
            depth + 1,
            attributes.font || inheritedFont,
            attributes.background || inheritedBackground,
            attributes.borderRadius || inheritedBorderRadius,
            attributes.zIndex || inheritedZIndex,
            attributes.opacity || inheritedOpacity
          );
          
          allResults.push(...childResults.elements.map((attr) => ({
            attributes: attr,
            depth: depth + 1,
          })));
        }
        
        let backgroundColor = inheritedBackground?.color;
        if (depth === 0) {
          const elementsWithRootPosition = allResults.filter(({ attributes }) => {
            return (
              attributes.position &&
              attributes.position.left === 0 &&
              attributes.position.top === 0 &&
              attributes.position.width === rootRect.width &&
              attributes.position.height === rootRect.height
            );
          });
          
          for (const { attributes } of elementsWithRootPosition) {
            if (attributes.background && attributes.background.color) {
              backgroundColor = attributes.background.color;
              break;
            }
          }
        }
        
        const filteredResults = depth === 0
          ? allResults.filter(({ attributes }) => {
              const hasBackground = attributes.background && attributes.background.color;
              const hasBorder = attributes.border && attributes.border.color;
              const hasShadow = attributes.shadow && attributes.shadow.color;
              const hasText = attributes.innerText && attributes.innerText.trim().length > 0;
              const hasImage = attributes.imageSrc;
              const isSvg = attributes.tagName === 'svg';
              const isCanvas = attributes.tagName === 'canvas';
              const isTable = attributes.tagName === 'table';
              
              const occupiesRoot =
                attributes.position &&
                attributes.position.left === 0 &&
                attributes.position.top === 0 &&
                attributes.position.width === rootRect.width &&
                attributes.position.height === rootRect.height;
              
              const hasVisualProperties = hasBackground || hasBorder || hasShadow || hasText;
              const hasSpecialContent = hasImage || isSvg || isCanvas || isTable;
              
              return (hasVisualProperties && !occupiesRoot) || hasSpecialContent;
            })
          : allResults;
        
        if (depth === 0) {
          const sortedElements = filteredResults
            .sort((a, b) => {
              const zIndexA = a.attributes.zIndex || 0;
              const zIndexB = b.attributes.zIndex || 0;
              
              if (zIndexA === zIndexB) {
                return a.depth - b.depth;
              }
              
              return zIndexB - zIndexA;
            })
            .map(({ attributes }) => {
              if (
                attributes.shadow &&
                attributes.shadow.color &&
                (!attributes.background || !attributes.background.color) &&
                backgroundColor
              ) {
                attributes.background = {
                  color: backgroundColor,
                  opacity: undefined,
                };
              }
              return attributes;
            });
          
          return {
            elements: sortedElements,
            backgroundColor: backgroundColor,
          };
        } else {
          return {
            elements: filteredResults.map(({ attributes }) => attributes),
            backgroundColor: backgroundColor,
          };
        }
      }
      
      return getAllChildElementsAttributesRecursive(slide, null, 0, undefined, undefined, undefined, undefined, undefined);
        } catch (error) {
          console.error('Error in slide processing:', error);
          return {
            error: error.message || String(error),
            elements: [],
            backgroundColor: undefined
          };
        }
    })();
  `);

    if (result.error) {
      throw new ApiError(`Failed to analyze slide ${slideIndex}: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error(`Error getting attributes for slide ${slideIndex}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ApiError(`Failed to analyze slide ${slideIndex}: ${errorMessage}`);
  }
}

function getElementAttributesFunction(): string {
  return `
    function getElementAttributes(el) {
      function colorToHex(color) {
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
          return { hex: undefined, opacity: undefined };
        }
        
        if (color.startsWith('rgba(') || color.startsWith('hsla(')) {
          const match = color.match(/rgba?\\(([^)]+)\\)|hsla?\\(([^)]+)\\)/);
          if (match) {
            const values = match[1] || match[2];
            const parts = values.split(',').map((part) => part.trim());
            
            if (parts.length >= 4) {
              const opacity = parseFloat(parts[3]);
              const rgbColor = color.replace(/rgba?\\(|hsla?\\(|\\)/g, '').split(',').slice(0, 3).join(',');
              const rgbString = color.startsWith('rgba') ? 'rgb(' + rgbColor + ')' : 'hsl(' + rgbColor + ')';
              
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = rgbString;
                const hexColor = ctx.fillStyle;
                const hex = hexColor.startsWith('#') ? hexColor.substring(1) : hexColor;
                return {
                  hex: hex,
                  opacity: isNaN(opacity) ? undefined : opacity,
                };
              }
            }
          }
        }
        
        if (color.startsWith('rgb(') || color.startsWith('hsl(')) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = color;
            const hexColor = ctx.fillStyle;
            const hex = hexColor.startsWith('#') ? hexColor.substring(1) : hexColor;
            return { hex: hex, opacity: undefined };
          }
        }
        
        if (color.startsWith('#')) {
          const hex = color.substring(1);
          return { hex: hex, opacity: undefined };
        }
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return { hex: color, opacity: undefined };
        
        ctx.fillStyle = color;
        const hexColor = ctx.fillStyle;
        const hex = hexColor.startsWith('#') ? hexColor.substring(1) : hexColor;
        return { hex: hex, opacity: undefined };
      }
      
      function hasOnlyTextNodes(el) {
        const children = el.childNodes;
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.nodeType === Node.ELEMENT_NODE) {
            return false;
          }
        }
        return true;
      }
      
      function parsePosition(el) {
        const rect = el.getBoundingClientRect();
        return {
          left: isFinite(rect.left) ? rect.left : 0,
          top: isFinite(rect.top) ? rect.top : 0,
          width: isFinite(rect.width) ? rect.width : 0,
          height: isFinite(rect.height) ? rect.height : 0,
        };
      }
      
      function parseBackground(computedStyles) {
        const backgroundColorResult = colorToHex(computedStyles.backgroundColor);
        
        const background = {
          color: backgroundColorResult.hex,
          opacity: backgroundColorResult.opacity,
        };
        
        if (!background.color && background.opacity === undefined) {
          return undefined;
        }
        
        return background;
      }
      
      function parseBackgroundImage(computedStyles) {
        const backgroundImage = computedStyles.backgroundImage;
        
        if (!backgroundImage || backgroundImage === 'none') {
          return undefined;
        }
        
        const urlMatch = backgroundImage.match(/url\\(['"]?([^'"]+)['"]?\\)/);
        if (urlMatch && urlMatch[1]) {
          return urlMatch[1];
        }
        
        return undefined;
      }
      
      function parseBorder(computedStyles) {
        const borderColorResult = colorToHex(computedStyles.borderColor);
        const borderWidth = parseFloat(computedStyles.borderWidth);
        
        if (borderWidth === 0) {
          return undefined;
        }
        
        const border = {
          color: borderColorResult.hex,
          width: isNaN(borderWidth) ? undefined : borderWidth,
          opacity: borderColorResult.opacity,
        };
        
        if (!border.color && border.width === undefined && border.opacity === undefined) {
          return undefined;
        }
        
        return border;
      }
      
      function parseShadow(computedStyles) {
        const boxShadow = computedStyles.boxShadow;
        let shadow = {};
        
        if (boxShadow && boxShadow !== 'none') {
          const shadows = [];
          let currentShadow = '';
          let parenCount = 0;
          
          for (let i = 0; i < boxShadow.length; i++) {
            const char = boxShadow[i];
            if (char === '(') {
              parenCount++;
            } else if (char === ')') {
              parenCount--;
            } else if (char === ',' && parenCount === 0) {
              shadows.push(currentShadow.trim());
              currentShadow = '';
              continue;
            }
            currentShadow += char;
          }
          
          if (currentShadow.trim()) {
            shadows.push(currentShadow.trim());
          }
          
          let selectedShadow = '';
          let bestShadowScore = -1;
          
          for (let i = 0; i < shadows.length; i++) {
            const shadowStr = shadows[i];
            
            const shadowParts = shadowStr.split(' ');
            const numericParts = [];
            const colorParts = [];
            let isInset = false;
            let currentColor = '';
            let inColorFunction = false;
            
            for (let j = 0; j < shadowParts.length; j++) {
              const part = shadowParts[j];
              const trimmedPart = part.trim();
              if (trimmedPart === '') continue;
              
              if (trimmedPart.toLowerCase() === 'inset') {
                isInset = true;
                continue;
              }
              
              if (trimmedPart.match(/^(rgba?|hsla?)\\s*\\(/i)) {
                inColorFunction = true;
                currentColor = trimmedPart;
                continue;
              }
              
              if (inColorFunction) {
                currentColor += ' ' + trimmedPart;
                
                const openParens = (currentColor.match(/\\(/g) || []).length;
                const closeParens = (currentColor.match(/\\)/g) || []).length;
                
                if (openParens <= closeParens) {
                  colorParts.push(currentColor);
                  currentColor = '';
                  inColorFunction = false;
                }
                continue;
              }
              
              const numericValue = parseFloat(trimmedPart);
              if (!isNaN(numericValue)) {
                numericParts.push(numericValue);
              } else {
                colorParts.push(trimmedPart);
              }
            }
            
            let hasVisibleColor = false;
            if (colorParts.length > 0) {
              const shadowColor = colorParts.join(' ');
              const colorResult = colorToHex(shadowColor);
              hasVisibleColor = !!(colorResult.hex && colorResult.hex !== '000000' && colorResult.opacity !== 0);
            }
            
            const hasNonZeroValues = numericParts.some((value) => value !== 0);
            
            let shadowScore = 0;
            if (hasNonZeroValues) {
              shadowScore += numericParts.filter((value) => value !== 0).length;
            }
            if (hasVisibleColor) {
              shadowScore += 2;
            }
            
            if ((hasNonZeroValues || hasVisibleColor) && shadowScore > bestShadowScore) {
              selectedShadow = shadowStr;
              bestShadowScore = shadowScore;
            }
          }
          
          if (!selectedShadow && shadows.length > 0) {
            selectedShadow = shadows[0];
          }
          
          if (selectedShadow) {
            const shadowParts = selectedShadow.split(' ');
            const numericParts = [];
            const colorParts = [];
            let isInset = false;
            let currentColor = '';
            let inColorFunction = false;
            
            for (let i = 0; i < shadowParts.length; i++) {
              const part = shadowParts[i];
              const trimmedPart = part.trim();
              if (trimmedPart === '') continue;
              
              if (trimmedPart.toLowerCase() === 'inset') {
                isInset = true;
                continue;
              }
              
              if (trimmedPart.match(/^(rgba?|hsla?)\\s*\\(/i)) {
                inColorFunction = true;
                currentColor = trimmedPart;
                continue;
              }
              
              if (inColorFunction) {
                currentColor += ' ' + trimmedPart;
                
                const openParens = (currentColor.match(/\\(/g) || []).length;
                const closeParens = (currentColor.match(/\\)/g) || []).length;
                
                if (openParens <= closeParens) {
                  colorParts.push(currentColor);
                  currentColor = '';
                  inColorFunction = false;
                }
                continue;
              }
              
              const numericValue = parseFloat(trimmedPart);
              if (!isNaN(numericValue)) {
                numericParts.push(numericValue);
              } else {
                colorParts.push(trimmedPart);
              }
            }
            
            if (numericParts.length >= 2) {
              const offsetX = numericParts[0];
              const offsetY = numericParts[1];
              const blurRadius = numericParts.length >= 3 ? numericParts[2] : 0;
              const spreadRadius = numericParts.length >= 4 ? numericParts[3] : 0;
              
              if (colorParts.length > 0) {
                const shadowColor = colorParts.join(' ');
                const shadowColorResult = colorToHex(shadowColor);
                
                if (shadowColorResult.hex) {
                  shadow = {
                    offset: [offsetX, offsetY],
                    color: shadowColorResult.hex,
                    opacity: shadowColorResult.opacity,
                    radius: blurRadius,
                    spread: spreadRadius,
                    inset: isInset,
                    angle: Math.atan2(offsetY, offsetX) * (180 / Math.PI),
                  };
                }
              }
            }
          }
        }
        
        if (Object.keys(shadow).length === 0) {
          return undefined;
        }
        
        return shadow;
      }
      
      function parseFont(computedStyles) {
        const fontSize = parseFloat(computedStyles.fontSize);
        const fontWeight = parseInt(computedStyles.fontWeight);
        const fontColorResult = colorToHex(computedStyles.color);
        const fontFamily = computedStyles.fontFamily;
        const fontStyle = computedStyles.fontStyle;
        
        let fontName = undefined;
        if (fontFamily !== 'initial') {
          const firstFont = fontFamily.split(',')[0].trim().replace(/['"]/g, '');
          fontName = firstFont;
        }
        
        const font = {
          name: fontName,
          size: isNaN(fontSize) ? undefined : fontSize,
          weight: isNaN(fontWeight) ? undefined : fontWeight,
          color: fontColorResult.hex,
          italic: fontStyle === 'italic',
        };
        
        if (!font.name && font.size === undefined && font.weight === undefined && !font.color && !font.italic) {
          return undefined;
        }
        
        return font;
      }
      
      function parseLineHeight(computedStyles, el) {
        const lineHeight = computedStyles.lineHeight;
        const innerText = el.textContent || '';
        
        const htmlEl = el;
        
        const fontSize = parseFloat(computedStyles.fontSize);
        const computedLineHeight = parseFloat(computedStyles.lineHeight);
        
        const singleLineHeight = !isNaN(computedLineHeight) ? computedLineHeight : fontSize * 1.2;
        
        const hasExplicitLineBreaks = innerText.includes('\\n') || innerText.includes('\\r') || innerText.includes('\\r\\n');
        const hasTextWrapping = htmlEl.offsetHeight > singleLineHeight * 2;
        const hasOverflow = htmlEl.scrollHeight > htmlEl.clientHeight;
        
        const isMultiline = hasExplicitLineBreaks || hasTextWrapping || hasOverflow;
        
        if (isMultiline && lineHeight && lineHeight !== 'normal') {
          const parsedLineHeight = parseFloat(lineHeight);
          if (!isNaN(parsedLineHeight)) {
            return parsedLineHeight;
          }
        }
        
        return undefined;
      }
      
      function parseMargin(computedStyles) {
        const marginTop = parseFloat(computedStyles.marginTop);
        const marginBottom = parseFloat(computedStyles.marginBottom);
        const marginLeft = parseFloat(computedStyles.marginLeft);
        const marginRight = parseFloat(computedStyles.marginRight);
        const marginObj = {
          top: isNaN(marginTop) ? undefined : marginTop,
          bottom: isNaN(marginBottom) ? undefined : marginBottom,
          left: isNaN(marginLeft) ? undefined : marginLeft,
          right: isNaN(marginRight) ? undefined : marginRight,
        };
        
        return marginObj.top === 0 && marginObj.bottom === 0 && marginObj.left === 0 && marginObj.right === 0
          ? undefined
          : marginObj;
      }
      
      function parsePadding(computedStyles) {
        const paddingTop = parseFloat(computedStyles.paddingTop);
        const paddingBottom = parseFloat(computedStyles.paddingBottom);
        const paddingLeft = parseFloat(computedStyles.paddingLeft);
        const paddingRight = parseFloat(computedStyles.paddingRight);
        const paddingObj = {
          top: isNaN(paddingTop) ? undefined : paddingTop,
          bottom: isNaN(paddingBottom) ? undefined : paddingBottom,
          left: isNaN(paddingLeft) ? undefined : paddingLeft,
          right: isNaN(paddingRight) ? undefined : paddingRight,
        };
        
        return paddingObj.top === 0 && paddingObj.bottom === 0 && paddingObj.left === 0 && paddingObj.right === 0
          ? undefined
          : paddingObj;
      }
      
      function parseBorderRadius(computedStyles, el) {
        const borderRadius = computedStyles.borderRadius;
        let borderRadiusValue;
        
        if (borderRadius && borderRadius !== '0px') {
          const radiusParts = borderRadius.split(' ').map((part) => parseFloat(part));
          if (radiusParts.length === 1) {
            borderRadiusValue = [radiusParts[0], radiusParts[0], radiusParts[0], radiusParts[0]];
          } else if (radiusParts.length === 2) {
            borderRadiusValue = [radiusParts[0], radiusParts[1], radiusParts[0], radiusParts[1]];
          } else if (radiusParts.length === 3) {
            borderRadiusValue = [radiusParts[0], radiusParts[1], radiusParts[2], radiusParts[1]];
          } else if (radiusParts.length === 4) {
            borderRadiusValue = radiusParts;
          }
          
          if (borderRadiusValue) {
            const rect = el.getBoundingClientRect();
            const maxRadiusX = rect.width / 2;
            const maxRadiusY = rect.height / 2;
            
            borderRadiusValue = borderRadiusValue.map((radius, index) => {
              const maxRadius = index === 0 || index === 2 ? maxRadiusX : maxRadiusY;
              return Math.max(0, Math.min(radius, maxRadius));
            });
          }
        }
        
        return borderRadiusValue;
      }
      
      function parseShape(el, borderRadiusValue) {
        if (el.tagName.toLowerCase() === 'img') {
          return borderRadiusValue && borderRadiusValue.length === 4 && borderRadiusValue.every((radius) => radius === 50)
            ? 'circle'
            : 'rectangle';
        }
        return undefined;
      }
      
      function parseFilters(computedStyles) {
        const filter = computedStyles.filter;
        if (!filter || filter === 'none') {
          return undefined;
        }
        
        const filters = {};
        
        const filterFunctions = filter.match(/[a-zA-Z]+\\([^)]*\\)/g);
        if (filterFunctions) {
          filterFunctions.forEach((func) => {
            const match = func.match(/([a-zA-Z]+)\\(([^)]*)\\)/);
            if (match) {
              const filterType = match[1];
              const value = parseFloat(match[2]);
              
              if (!isNaN(value)) {
                switch (filterType) {
                  case 'invert':
                    filters.invert = value;
                    break;
                  case 'brightness':
                    filters.brightness = value;
                    break;
                  case 'contrast':
                    filters.contrast = value;
                    break;
                  case 'saturate':
                    filters.saturate = value;
                    break;
                  case 'hue-rotate':
                    filters.hueRotate = value;
                    break;
                  case 'blur':
                    filters.blur = value;
                    break;
                  case 'grayscale':
                    filters.grayscale = value;
                    break;
                  case 'sepia':
                    filters.sepia = value;
                    break;
                  case 'opacity':
                    filters.opacity = value;
                    break;
                }
              }
            }
          });
        }
        
        return Object.keys(filters).length > 0 ? filters : undefined;
      }
      
      function parseElementAttributes(el) {
        let tagName = el.tagName.toLowerCase();
        
        const computedStyles = window.getComputedStyle(el);
        
        const position = parsePosition(el);
        
        const shadow = parseShadow(computedStyles);
        
        const background = parseBackground(computedStyles);
        
        const border = parseBorder(computedStyles);
        
        const font = parseFont(computedStyles);
        
        const lineHeight = parseLineHeight(computedStyles, el);
        
        const margin = parseMargin(computedStyles);
        
        const padding = parsePadding(computedStyles);
        
        const innerText = hasOnlyTextNodes(el) ? el.textContent || undefined : undefined;
        
        const zIndex = parseInt(computedStyles.zIndex);
        const zIndexValue = isNaN(zIndex) ? 0 : zIndex;
        
        const textAlign = computedStyles.textAlign;
        const objectFit = computedStyles.objectFit;
        
        const parsedBackgroundImage = parseBackgroundImage(computedStyles);
        const imageSrc = el.src || parsedBackgroundImage;
        
        const borderRadiusValue = parseBorderRadius(computedStyles, el);
        
        const shape = parseShape(el, borderRadiusValue);
        
        const textWrap = computedStyles.whiteSpace !== 'nowrap';
        
        const filters = parseFilters(computedStyles);
        
        const opacity = parseFloat(computedStyles.opacity);
        const elementOpacity = isNaN(opacity) ? undefined : opacity;
        
        return {
          tagName: tagName,
          id: el.id,
          className: el.className && typeof el.className === 'string' ? el.className : el.className ? el.className.toString() : undefined,
          innerText: innerText,
          opacity: elementOpacity,
          background: background,
          border: border,
          shadow: shadow,
          font: font,
          position: position,
          margin: margin,
          padding: padding,
          zIndex: zIndexValue,
          textAlign: textAlign !== 'left' ? textAlign : undefined,
          lineHeight: lineHeight,
          borderRadius: borderRadiusValue,
          imageSrc: imageSrc,
          objectFit: objectFit,
          clip: false,
          overlay: undefined,
          shape: shape,
          connectorType: undefined,
          textWrap: textWrap,
          should_screenshot: false,
          element: undefined,
          filters: filters,
        };
      }
      
      return parseElementAttributes(el);
    }
  `;
}

async function postProcessSlidesAttributes(
  window: BrowserWindow,
  slidesAttributes: SlideAttributesResult[],
  screenshotsDir: string,
  speakerNotes: string[]
) {
  for (const [index, slideAttributes] of slidesAttributes.entries()) {
    for (const element of slideAttributes.elements) {
      if (element.should_screenshot) {
        const screenshotPath = await screenshotElement(
          window,
          index,
          element,
          screenshotsDir
        );
        element.imageSrc = screenshotPath;
        element.should_screenshot = false;
        element.objectFit = "cover";
      }
    }
    slideAttributes.speakerNote = speakerNotes[index];
  }
}

async function screenshotElement(
  window: BrowserWindow,
  slideIndex: number,
  element: ElementAttributes,
  screenshotsDir: string
): Promise<string> {
  const screenshotPath = path.join(
    screenshotsDir,
    `${uuidv4()}.png`
  ) as `${string}.png`;

  // For SVG elements, try Sharp first, then fallback to screenshot
  if (element.tagName === "svg") {
    
    const svgData = await window.webContents.executeJavaScript(`
      (function() {
        try {
          const slidesWrapper = document.getElementById('presentation-slides-wrapper');
          const slides = Array.from(slidesWrapper.querySelectorAll(':scope > div > div'));
          const slide = slides[${slideIndex}];
          
          if (!slide) {
            return { error: 'Slide not found at index ${slideIndex}' };
          }
          
          // IMPORTANT: Element positions were stored relative to the slide root.
          // We need to convert them back to absolute viewport coordinates by
          // adding the slide's bounding rect offset.
          const slideRect = slide.getBoundingClientRect();
          
          // Target position in absolute viewport coordinates
          const targetPos = {
            left: ${element.position!.left} + slideRect.left,
            top: ${element.position!.top} + slideRect.top,
            width: ${element.position!.width},
            height: ${element.position!.height}
          };
          
          // Get all SVG elements in the slide
          const allSvgs = Array.from(slide.querySelectorAll('svg'));
          
          let svgElement = null;
          let bestMatch = null;
          let bestDistance = Infinity;
          const candidateInfo = [];
          
          for (const svg of allSvgs) {
            const rect = svg.getBoundingClientRect();
            const distance = Math.sqrt(
              Math.pow(rect.left - targetPos.left, 2) +
              Math.pow(rect.top - targetPos.top, 2) +
              Math.pow(rect.width - targetPos.width, 2) +
              Math.pow(rect.height - targetPos.height, 2)
            );
            
            candidateInfo.push({
              left: rect.left, 
              top: rect.top, 
              width: rect.width, 
              height: rect.height, 
              distance: distance
            });
            
            if (distance < bestDistance) {
              bestDistance = distance;
              bestMatch = svg;
            }
            
            // If very close match (within 2 pixels in all dimensions), use it
            if (Math.abs(rect.left - targetPos.left) < 2 &&
                Math.abs(rect.top - targetPos.top) < 2 &&
                Math.abs(rect.width - targetPos.width) < 2 &&
                Math.abs(rect.height - targetPos.height) < 2) {
              svgElement = svg;
              break;
            }
          }
          
          // If no exact match, use the best match if it's reasonably close
          if (!svgElement && bestMatch && bestDistance < 100) {
            svgElement = bestMatch;
          }
          
          if (!svgElement) {
            return { 
              error: 'SVG not found', 
              bestDistance: bestDistance, 
              svgCount: allSvgs.length,
              targetPos: targetPos,
              slideRect: { left: slideRect.left, top: slideRect.top, width: slideRect.width, height: slideRect.height },
              candidates: candidateInfo
            };
          }
        
          // Clone the SVG to avoid modifying the original
          const clonedSvg = svgElement.cloneNode(true);
          
          // Get computed styles from the original element and its parent
          const computedStyle = window.getComputedStyle(svgElement);
          const parentStyle = window.getComputedStyle(svgElement.parentElement);
          const fontColor = computedStyle.color || parentStyle.color || '#000000';
          
          // Apply the color
          clonedSvg.style.color = fontColor;
          
          // Ensure SVG has proper dimensions
          const rect = svgElement.getBoundingClientRect();
          if (!clonedSvg.hasAttribute('width')) {
            clonedSvg.setAttribute('width', rect.width.toString());
          }
          if (!clonedSvg.hasAttribute('height')) {
            clonedSvg.setAttribute('height', rect.height.toString());
          }
          
          // Ensure viewBox is set
          if (!clonedSvg.hasAttribute('viewBox')) {
            const width = clonedSvg.getAttribute('width') || rect.width;
            const height = clonedSvg.getAttribute('height') || rect.height;
            clonedSvg.setAttribute('viewBox', \`0 0 \${width} \${height}\`);
          }
          
          // Replace currentColor with actual color in all elements
          const allSvgElements = clonedSvg.querySelectorAll('*');
          allSvgElements.forEach((el) => {
            ['stroke', 'fill', 'color'].forEach((attr) => {
              const value = el.getAttribute(attr);
              if (value === 'currentColor') {
                el.setAttribute(attr, fontColor);
              }
            });
            
            // Also check inline styles
            const style = el.getAttribute('style');
            if (style && style.includes('currentColor')) {
              el.setAttribute('style', style.replace(/currentColor/g, fontColor));
            }
          });
          
          // Also replace currentColor in the root SVG element
          ['stroke', 'fill'].forEach((attr) => {
            const value = clonedSvg.getAttribute(attr);
            if (value === 'currentColor') {
              clonedSvg.setAttribute(attr, fontColor);
            }
          });
          
          return { 
            success: true, 
            html: clonedSvg.outerHTML,
            hasViewBox: clonedSvg.hasAttribute('viewBox'),
            hasDimensions: clonedSvg.hasAttribute('width') && clonedSvg.hasAttribute('height'),
            color: fontColor
          };
        } catch (error) {
          return { 
            error: 'Exception in SVG extraction: ' + (error.message || String(error)),
            stack: error.stack
          };
        }
      })();
    `);

    if (svgData.success && svgData.html) {
      try {
        const svgBuffer = Buffer.from(svgData.html);
        const pngBuffer = await sharp(svgBuffer)
          .resize(
            Math.round(element.position!.width!),
            Math.round(element.position!.height!),
            {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
          )
          .png()
          .toBuffer();
        fs.writeFileSync(screenshotPath, pngBuffer);
        return screenshotPath;
      } catch (error) {
        console.warn('[PPTX Export] Sharp SVG conversion failed, falling back to screenshot:', (error as Error).message);
        // Fall through to screenshot method as fallback
      }
    } else if (svgData.error) {
      console.warn('[PPTX Export] SVG extraction failed:', svgData.error, '- using screenshot fallback');
    }
  }

  // Fallback screenshot method for SVG (when Sharp fails) and other elements (canvas, table)
  
  // Get the slide's absolute position to convert relative coords back to absolute
  const slideRectForScreenshot = await window.webContents.executeJavaScript(`
    (function() {
      const slidesWrapper = document.getElementById('presentation-slides-wrapper');
      const slides = Array.from(slidesWrapper.querySelectorAll(':scope > div > div'));
      const slide = slides[${slideIndex}];
      if (!slide) return { left: 0, top: 0 };
      const rect = slide.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    })();
  `);
  
  // Convert relative element position to absolute viewport position
  const absLeft = element.position!.left + slideRectForScreenshot.left;
  const absTop = element.position!.top + slideRectForScreenshot.top;
  
  console.log('[PPTX Export] Slide rect:', slideRectForScreenshot, 'Absolute target:', { left: absLeft, top: absTop });
  
  await window.webContents.executeJavaScript(`
    (function() {
      const slidesWrapper = document.getElementById('presentation-slides-wrapper');
      const slides = Array.from(slidesWrapper.querySelectorAll(':scope > div > div'));
      const slide = slides[${slideIndex}];
      
      if (!slide) return;
      
      // Use absolute viewport coordinates for matching
      const absLeft = ${absLeft};
      const absTop = ${absTop};
      const targetWidth = ${element.position!.width};
      const targetHeight = ${element.position!.height};
      
      const allElements = Array.from(slide.querySelectorAll('*'));
      const targetElement = allElements.find((el) => {
        const rect = el.getBoundingClientRect();
        return el.tagName.toLowerCase() === '${element.tagName}' &&
               Math.abs(rect.left - absLeft) < 2 &&
               Math.abs(rect.top - absTop) < 2 &&
               Math.abs(rect.width - targetWidth) < 2 &&
               Math.abs(rect.height - targetHeight) < 2;
      });
      
      if (!targetElement) return;
      
      const originalOpacities = new Map();
      const allDocumentElements = document.querySelectorAll('*');
      
      allDocumentElements.forEach((elem) => {
        const computedStyle = window.getComputedStyle(elem);
        originalOpacities.set(elem, computedStyle.opacity);
        
        if (
          targetElement === elem ||
          targetElement.contains(elem) ||
          elem.contains(targetElement)
        ) {
          elem.style.opacity = computedStyle.opacity || '1';
          return;
        }
        
        elem.style.opacity = '0';
      });
      
      targetElement.__restoreStyles = function() {
        originalOpacities.forEach((opacity, elem) => {
          elem.style.opacity = opacity;
        });
      };
    })();
  `);

  // Small delay to ensure styles are applied
  await new Promise((resolve) => setTimeout(resolve, 50));

  // capturePage uses absolute viewport coordinates
  const rect = {
    x: absLeft,
    y: absTop,
    width: element.position!.width,
    height: element.position!.height,
  };

  const screenshot = await window.webContents.capturePage(rect);
  fs.writeFileSync(screenshotPath, screenshot.toPNG());

  // Restore original opacities
  await window.webContents.executeJavaScript(`
    (function() {
      const slidesWrapper = document.getElementById('presentation-slides-wrapper');
      const slides = Array.from(slidesWrapper.querySelectorAll(':scope > div > div'));
      const slide = slides[${slideIndex}];
      
      if (!slide) return;
      
      const absLeft = ${absLeft};
      const absTop = ${absTop};
      const targetWidth = ${element.position!.width};
      const targetHeight = ${element.position!.height};
      
      const allElements = Array.from(slide.querySelectorAll('*'));
      const targetElement = allElements.find((el) => {
        const rect = el.getBoundingClientRect();
        return el.tagName.toLowerCase() === '${element.tagName}' &&
               Math.abs(rect.left - absLeft) < 2 &&
               Math.abs(rect.top - absTop) < 2 &&
               Math.abs(rect.width - targetWidth) < 2 &&
               Math.abs(rect.height - targetHeight) < 2;
      });
      
      if (targetElement && targetElement.__restoreStyles) {
        targetElement.__restoreStyles();
      }
    })();
  `);

  return screenshotPath;
}

function convertElementAttributesToPptxSlides(
  slidesAttributes: SlideAttributesResult[]
): PptxSlide[] {
  return slidesAttributes.map((slideAttributes) => {
    const shapes = slideAttributes.elements.map(element => {
      return convertElementToPptxShape(element);
    }).filter(Boolean);

    const slide: PptxSlide = {
      shapes: shapes,
      note: slideAttributes.speakerNote
    };

    if (slideAttributes.backgroundColor) {
      slide.background = {
        color: slideAttributes.backgroundColor,
        opacity: 1.0
      };
    }

    return slide;
  });
}

function convertTextAlignToPptxAlignment(textAlign?: string): number | undefined {
  if (!textAlign) return undefined;

  // PP_ALIGN enum values: LEFT=1, CENTER=2, RIGHT=3, JUSTIFY=4, DISTRIBUTE=5, THAI_DISTRIBUTE=6, JUSTIFY_LOW=7, MIXED=-2
  switch (textAlign.toLowerCase()) {
    case 'left':
    case 'start':
      return 1; // PP_ALIGN.LEFT
    case 'center':
      return 2; // PP_ALIGN.CENTER
    case 'right':
    case 'end':
      return 3; // PP_ALIGN.RIGHT
    case 'justify':
      return 4; // PP_ALIGN.JUSTIFY
    default:
      return 1; // PP_ALIGN.LEFT
  }
}

function convertLineHeightToRelative(lineHeight?: number, fontSize?: number): number | undefined {
  if (!lineHeight) return undefined;

  let calculatedLineHeight = 1.2;
  if (lineHeight < 10) {
    calculatedLineHeight = lineHeight;
  }

  if (fontSize && fontSize > 0) {
    calculatedLineHeight = Math.round((lineHeight / fontSize) * 100) / 100;
  }

  return calculatedLineHeight - 0.3
}

function convertElementToPptxShape(element: ElementAttributes): any | null {
  if (!element.position) {
    return null;
  }

  if (element.tagName === 'img' || (element.className && typeof element.className === 'string' && element.className.includes('image')) || element.imageSrc) {
    return convertToPictureBox(element);
  }

  if (element.innerText && element.innerText.trim().length > 0) {
    // Use AutoShape model if there's background color and border radius
    if (element.background?.color && element.borderRadius && element.borderRadius.some(radius => radius > 0)) {
      return convertToAutoShapeBox(element);
    }
    return convertToTextBox(element);
  }

  if (element.tagName === 'hr') {
    return convertToConnector(element);
  }

  return convertToAutoShapeBox(element);
}

function convertToTextBox(element: ElementAttributes): any {
  const position = {
    left: Math.round(element.position?.left ?? 0),
    top: Math.round(element.position?.top ?? 0),
    width: Math.round(element.position?.width ?? 0),
    height: Math.round(element.position?.height ?? 0)
  };

  const fill = element.background?.color ? {
    color: element.background.color,
    opacity: element.background.opacity ?? 1.0
  } : undefined;

  const font = element.font ? {
    name: element.font.name ?? "Inter",
    size: Math.round(element.font.size ?? 16),
    font_weight: element.font.weight ?? 400,
    italic: element.font.italic ?? false,
    color: element.font.color ?? "000000"
  } : undefined;

  const paragraph = {
    spacing: undefined,
    alignment: convertTextAlignToPptxAlignment(element.textAlign),
    font,
    line_height: convertLineHeightToRelative(element.lineHeight, element.font?.size),
    text: element.innerText
  };

  return {
    shape_type: "textbox",
    margin: undefined,
    fill,
    position,
    text_wrap: element.textWrap ?? true,
    paragraphs: [paragraph]
  };
}

function convertToAutoShapeBox(element: ElementAttributes): any {
  const position = {
    left: Math.round(element.position?.left ?? 0),
    top: Math.round(element.position?.top ?? 0),
    width: Math.round(element.position?.width ?? 0),
    height: Math.round(element.position?.height ?? 0)
  };

  const fill = element.background?.color ? {
    color: element.background.color,
    opacity: element.background.opacity ?? 1.0
  } : undefined;

  const stroke = element.border?.color ? {
    color: element.border.color,
    thickness: element.border.width ?? 1,
    opacity: element.border.opacity ?? 1.0
  } : undefined;

  const shadow = element.shadow?.color ? {
    radius: Math.round(element.shadow.radius ?? 4),
    offset: Math.round(element.shadow.offset ? Math.sqrt(element.shadow.offset[0] ** 2 + element.shadow.offset[1] ** 2) : 0),
    color: element.shadow.color,
    opacity: element.shadow.opacity ?? 0.5,
    angle: Math.round(element.shadow.angle ?? 0)
  } : undefined;

  const paragraphs = element.innerText ? [{
    spacing: undefined,
    alignment: convertTextAlignToPptxAlignment(element.textAlign),
    font: element.font ? {
      name: element.font.name ?? "Inter",
      size: Math.round(element.font.size ?? 16),
      font_weight: element.font.weight ?? 400,
      italic: element.font.italic ?? false,
      color: element.font.color ?? "000000"
    } : undefined,
    line_height: convertLineHeightToRelative(element.lineHeight, element.font?.size),
    text: element.innerText
  }] : undefined;

  // Use integer enum values: RECTANGLE = 1, ROUNDED_RECTANGLE = 5
  const shapeType = element.borderRadius ? 5 : 1;

  let borderRadius = undefined;
  for (const eachCornerRadius of element.borderRadius ?? []) {
    if (eachCornerRadius > 0) {
      borderRadius = Math.max(borderRadius ?? 0, eachCornerRadius);
    }
  }

  return {
    shape_type: "autoshape",
    type: shapeType,
    margin: undefined,
    fill,
    stroke,
    shadow,
    position,
    text_wrap: element.textWrap ?? true,
    border_radius: borderRadius || undefined,
    paragraphs
  };
}

function convertToPictureBox(element: ElementAttributes): any {
  const position = {
    left: Math.round(element.position?.left ?? 0),
    top: Math.round(element.position?.top ?? 0),
    width: Math.round(element.position?.width ?? 0),
    height: Math.round(element.position?.height ?? 0)
  };

  const objectFit = {
    fit: element.objectFit || 'contain'
  };

  const picture = {
    is_network: element.imageSrc ? element.imageSrc.startsWith('http') : false,
    path: element.imageSrc || ''
  };

  return {
    shape_type: "picture",
    position,
    margin: undefined,
    clip: element.clip ?? true,
    invert: element.filters?.invert === 1,
    opacity: element.opacity,
    border_radius: element.borderRadius ? element.borderRadius.map(r => Math.round(r)) : undefined,
    shape: element.shape || 'rectangle',
    object_fit: objectFit,
    picture
  };
}

function convertToConnector(element: ElementAttributes): any {
  const position = {
    left: Math.round(element.position?.left ?? 0),
    top: Math.round(element.position?.top ?? 0),
    width: Math.round(element.position?.width ?? 0),
    height: Math.round(element.position?.height ?? 0)
  };

  return {
    shape_type: "connector",
    type: 1, // STRAIGHT = 1
    position,
    thickness: element.border?.width ?? 0.5,
    color: element.border?.color || element.background?.color || '000000',
    opacity: element.border?.opacity ?? 1.0
  };
}
