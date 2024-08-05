//unsplashutils
export const getUnsplashAttribution = (photographerName) => {
    return `Photo by ${photographerName} on Unsplash`;
  };
  
  export const getUnsplashAttributionLink = (photographerUsername) => {
    return `https://unsplash.com/@${photographerUsername}?utm_source=your_app_name&utm_medium=referral`;
  };
  
  export const getUnsplashLink = () => {
    return "https://unsplash.com/?utm_source=your_app_name&utm_medium=referral";
  };