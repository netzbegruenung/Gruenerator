"""
Runtime hook to fix docling metadata lookup and python-docx template path resolution in PyInstaller builds.

PyInstaller doesn't always preserve package metadata (dist-info) in a way that
importlib.metadata can find it. This hook patches the version lookup to return
a default version if metadata isn't found, allowing docling to import successfully.

Additionally, python-docx uses __file__ to locate template files, which doesn't work
correctly in PyInstaller bundles. This hook patches the path resolution to use
sys._MEIPASS to find the templates.
"""
import sys
import os

# Only apply this fix when running in PyInstaller bundle
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    try:
        import importlib.metadata
        
        # Store original version function
        _original_version = importlib.metadata.version
        
        def _patched_version(package_name):
            """Patched version that handles missing metadata gracefully."""
            try:
                return _original_version(package_name)
            except importlib.metadata.PackageNotFoundError:
                # For docling packages, return a default version if metadata not found
                if package_name in ('docling', 'docling-core', 'docling-parse', 'docling-ibm-models'):
                    # Return a reasonable default version to allow import to proceed
                    return '2.43.0'
                raise
        
        # Patch the version function
        importlib.metadata.version = _patched_version
        
    except Exception:
        # If patching fails, continue anyway
        pass
    
    # Fix python-docx template path resolution
    try:
        import docx.parts.hdrftr as hdrftr_module
        
        # Store the original _default_header_xml function
        if hasattr(hdrftr_module, '_default_header_xml'):
            _original_default_header_xml = hdrftr_module._default_header_xml
            
            def _patched_default_header_xml():
                """Patched function that resolves template path correctly in PyInstaller bundle."""
                # Try to find the template file in the bundle
                template_path = os.path.join(sys._MEIPASS, 'docx', 'templates', 'default-header.xml')
                if os.path.exists(template_path):
                    with open(template_path, 'rb') as f:
                        return f.read()
                # Fallback to original implementation
                return _original_default_header_xml()
            
            # Patch the function
            hdrftr_module._default_header_xml = _patched_default_header_xml
        
        # Also patch _default_footer_xml if it exists
        if hasattr(hdrftr_module, '_default_footer_xml'):
            _original_default_footer_xml = hdrftr_module._default_footer_xml
            
            def _patched_default_footer_xml():
                """Patched function that resolves template path correctly in PyInstaller bundle."""
                template_path = os.path.join(sys._MEIPASS, 'docx', 'templates', 'default-footer.xml')
                if os.path.exists(template_path):
                    with open(template_path, 'rb') as f:
                        return f.read()
                return _original_default_footer_xml()
            
            hdrftr_module._default_footer_xml = _patched_default_footer_xml
            
    except Exception:
        # If patching fails, continue anyway
        pass