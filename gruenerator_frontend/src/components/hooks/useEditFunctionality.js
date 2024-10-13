import { useState, useCallback } from 'react';

const useEditFunctionality = (initialPosts = {}) => {
  const [posts, setPosts] = useState(initialPosts);
  const [editingPlatform, setEditingPlatform] = useState(null);

  const handleEditPost = useCallback((platform) => {
    setEditingPlatform(platform);
  }, []);

  const handleSavePost = useCallback(() => {
    setEditingPlatform(null);
  }, []);

  const handlePostContentChange = useCallback((platform, newContent, newHashtags) => {
    setPosts(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        content: newContent,
        hashtags: newHashtags
      }
    }));
  }, []);

  return {
    posts,
    setPosts,
    editingPlatform,
    handleEditPost,
    handleSavePost,
    handlePostContentChange
  };
};

export default useEditFunctionality;