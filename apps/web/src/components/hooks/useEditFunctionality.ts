import { type Dispatch, type SetStateAction, useState, useCallback } from 'react';

interface PostContent {
  content: string;
  hashtags: string;
  [key: string]: unknown;
}

type Posts = Record<string, PostContent>;

interface UseEditFunctionalityReturn {
  posts: Posts;
  setPosts: Dispatch<SetStateAction<Posts>>;
  editingPlatform: string | null;
  handleEditPost: (platform: string) => void;
  handleSavePost: () => void;
  handlePostContentChange: (platform: string, newContent: string, newHashtags: string) => void;
}

const useEditFunctionality = (initialPosts: Posts = {}): UseEditFunctionalityReturn => {
  const [posts, setPosts] = useState<Posts>(initialPosts);
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);

  const handleEditPost = useCallback((platform: string): void => {
    setEditingPlatform(platform);
  }, []);

  const handleSavePost = useCallback((): void => {
    setEditingPlatform(null);
  }, []);

  const handlePostContentChange = useCallback(
    (platform: string, newContent: string, newHashtags: string): void => {
      setPosts((prev) => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          content: newContent,
          hashtags: newHashtags,
        },
      }));
    },
    []
  );

  return {
    posts,
    setPosts,
    editingPlatform,
    handleEditPost,
    handleSavePost,
    handlePostContentChange,
  };
};

export default useEditFunctionality;
