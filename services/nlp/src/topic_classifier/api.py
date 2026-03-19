"""FastAPI service for topic classification."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from .analyzer import TopicClassifier
from .lexicons import TOPIC_CATEGORY_INFO, TopicCategory

logger = logging.getLogger("topic_classifier")

classifier: TopicClassifier | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global classifier
    logger.info("Loading spaCy model de_core_news_lg...")
    classifier = TopicClassifier()
    logger.info("Model loaded, service ready")
    yield
    classifier = None


app = FastAPI(title="Grünerator NLP Service", lifespan=lifespan)


class TextItem(BaseModel):
    id: str
    title: str = ""
    text: str = ""


class BatchRequest(BaseModel):
    texts: list[TextItem]


class NounCount(BaseModel):
    noun: str
    count: int


class TopicResult(BaseModel):
    id: str
    topics: dict[str, float]
    primaryTopic: str | None
    topNouns: list[NounCount] = []


class BatchResponse(BaseModel):
    results: list[TopicResult]


@app.get("/health")
def health():
    return {
        "status": "ok" if classifier and classifier.is_ready else "loading",
        "model": "de_core_news_lg",
        "topics": len(TopicCategory),
    }


@app.get("/topics")
def list_topics():
    return {
        cat.value: info
        for cat, info in TOPIC_CATEGORY_INFO.items()
    }


@app.post("/analyze/topics", response_model=BatchResponse)
def analyze_topics(request: BatchRequest):
    if not classifier:
        return BatchResponse(results=[])

    items = [{"id": t.id, "title": t.title, "text": t.text} for t in request.texts]
    results = classifier.classify_batch(items)
    return BatchResponse(results=[TopicResult(**r) for r in results])


class KeywordItem(BaseModel):
    keyword: str
    count: int
    topic: str | None


class KeywordsRequest(BaseModel):
    texts: list[TextItem]
    top_n: int = 50


class KeywordsResponse(BaseModel):
    keywords: list[KeywordItem]


@app.post("/analyze/keywords", response_model=KeywordsResponse)
def analyze_keywords(request: KeywordsRequest):
    if not classifier:
        return KeywordsResponse(keywords=[])

    items = [{"id": t.id, "title": t.title, "text": t.text} for t in request.texts]
    keywords = classifier.extract_keywords_batch(items, top_n=request.top_n)
    return KeywordsResponse(keywords=[KeywordItem(**k) for k in keywords])
