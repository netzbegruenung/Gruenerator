#!/usr/bin/env python3
"""
Pre-build the icons vectorstore for distribution.
This script should be run before packaging the application to ensure
the vectorstore is included in the bundle, eliminating first-run delays.
"""
import json
import os

# Windows: resolve ORT_DYLIB_PATH before fastembed_vectorstore is imported
import utils.onnx_windows_bootstrap  # noqa: F401

from fastembed_vectorstore import FastembedVectorstore
from utils.embedding_config import get_embedding_model


def build_vectorstore():
    """Build the icons vectorstore from icons.json"""
    
    print("Building icons vectorstore...")
    
    # Paths
    assets_dir = os.path.join(os.path.dirname(__file__), "assets")
    icons_path = os.path.join(assets_dir, "icons.json")
    vectorstore_path = os.path.join(assets_dir, "icons-vectorstore.json")
    cache_dir = os.path.join(os.path.dirname(__file__), "fastembed_cache")
    
    print(f"Icons JSON: {icons_path}")
    print(f"Vectorstore output: {vectorstore_path}")
    print(f"Cache directory: {cache_dir}")
    
    # Ensure directories exist
    os.makedirs(assets_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)
    
    # Check if icons.json exists
    if not os.path.exists(icons_path):
        print(f"ERROR: icons.json not found at {icons_path}")
        return False
    
    try:
        # Load icons
        with open(icons_path, "r", encoding="utf-8") as f:
            icons = json.load(f)
        
        print(f"Loaded {len(icons.get('icons', []))} icons from JSON")
        
        # Windows: BGESmallENV15 (AllMiniLML6V2 can fail there); macOS/Linux: AllMiniLML6V2
        model = get_embedding_model()
        vectorstore = FastembedVectorstore(model, cache_directory=cache_dir)
        
        # Prepare documents
        documents = []
        for each in icons["icons"]:
            # Only include 'bold' variants
            if each["name"].split("-")[-1] == "bold":
                doc_text = f"{each['name']}||{each['tags']}"
                documents.append(doc_text)
        
        print(f"Embedding {len(documents)} icon documents...")
        
        # Embed documents
        success = vectorstore.embed_documents(documents)
        
        if success:
            print(f"Successfully embedded {len(documents)} icons")
            
            # Save vectorstore
            vectorstore.save(vectorstore_path)
            print(f"Vectorstore saved to {vectorstore_path}")
            
            # Verify the file was created
            if os.path.exists(vectorstore_path):
                file_size = os.path.getsize(vectorstore_path)
                print(f"Vectorstore file size: {file_size / 1024:.2f} KB")
                print("Vectorstore built successfully!")
                return True
            else:
                print("ERROR: Vectorstore file was not created")
                return False
        else:
            print("ERROR: Failed to embed documents")
            return False
            
    except Exception as e:
        print(f"ERROR: Failed to build vectorstore: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = build_vectorstore()
    exit(0 if success else 1)
