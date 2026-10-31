#!/bin/sh
# Ollama с настройками для Mac M3 8 ГБ: одна модель, один запрос за раз, модель всегда в памяти.
# Если Ollama уже запущена как сервис (brew services), сначала: brew services stop ollama
export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_KEEP_ALIVE=-1
exec ollama serve
