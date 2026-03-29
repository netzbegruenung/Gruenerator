# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_all

# Collect fastembed dependencies
datas_fastembed, binaries_fastembed, hiddenimports_fastembed = collect_all('fastembed')
datas_fastembed_vs, binaries_fastembed_vs, hiddenimports_fastembed_vs = collect_all('fastembed_vectorstore')
datas_onnx, binaries_onnx, hiddenimports_onnx = collect_all('onnxruntime')

# Collect python-pptx templates and data files
datas_pptx, binaries_pptx, hiddenimports_pptx = collect_all('pptx')

# Collect docx2everything (DOCX/Markdown extraction on Windows)
datas_docx2everything, binaries_docx2everything, hiddenimports_docx2everything = collect_all('docx2everything')

# Collect greenlet - only installed on macOS (via pyproject.toml)
# collect_all returns empty lists if package not installed, so safe to call always
datas_greenlet, binaries_greenlet, hiddenimports_greenlet = collect_all('greenlet')

# Collect docling - only installed on Linux/macOS (via pyproject.toml)
# collect_all returns empty lists if package not installed, so safe to call always
datas_docling, binaries_docling, hiddenimports_docling = collect_all('docling')
# Also collect docling dependencies which are needed for metadata lookup
datas_docling_core, binaries_docling_core, hiddenimports_docling_core = collect_all('docling-core')
datas_docling_parse, binaries_docling_parse, hiddenimports_docling_parse = collect_all('docling-parse')
datas_docling_ibm, binaries_docling_ibm, hiddenimports_docling_ibm = collect_all('docling-ibm-models')

# Collect python-docx (dependency of docling) - needed for Word document processing on Linux/macOS
# collect_all returns empty lists if package not installed, so safe to call conditionally
datas_docx, binaries_docx, hiddenimports_docx = collect_all('docx')

# fastembed_cache is created at runtime when models are first used; include only if present (e.g. local dev)
datas_fastembed_cache = [('fastembed_cache', 'fastembed_cache')] if os.path.isdir('fastembed_cache') else []

excludes = []

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=binaries_fastembed + binaries_fastembed_vs + binaries_onnx + binaries_pptx + binaries_docx2everything + binaries_greenlet + binaries_docling + binaries_docling_core + binaries_docling_parse + binaries_docling_ibm + binaries_docx,
    datas=[
        ('assets', 'assets'),
        ('static', 'static'),
        ('alembic', 'alembic'),
    ] + datas_fastembed_cache + datas_fastembed + datas_fastembed_vs + datas_onnx + datas_pptx + datas_docx2everything + datas_greenlet + datas_docling + datas_docling_core + datas_docling_parse + datas_docling_ibm + datas_docx,
    hiddenimports=[
        'aiosqlite',
        'alembic',
        'sqlite3',
        'numpy',
        'pandas',
        'greenlet',
        'greenlet._greenlet',
        'importlib.metadata',
    ] + hiddenimports_fastembed + hiddenimports_fastembed_vs + hiddenimports_onnx + hiddenimports_pptx + hiddenimports_docx2everything + hiddenimports_greenlet + hiddenimports_docling + hiddenimports_docling_core + hiddenimports_docling_parse + hiddenimports_docling_ibm + hiddenimports_docx,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['runtime_hook_docling.py'],
    excludes=excludes,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='fastapi',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='fastapi',
)
