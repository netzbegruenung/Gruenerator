"""
Embedding model selection for icon search vectorstore.
Windows uses BGESmallENV15 (AllMiniLML6V2 can fail to initialize there);
macOS and Linux use AllMiniLML6V2 for backward compatibility.
"""
import os

from fastembed_vectorstore import FastembedEmbeddingModel


def get_embedding_model():
    """Return the embedding model for the current platform."""
    if os.name == "nt":
        return FastembedEmbeddingModel.BGESmallENV15
    return FastembedEmbeddingModel.AllMiniLML6V2
