"""FastAPI service for topic classification."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from .analyzer import TopicClassifier
from .lexicons import TOPIC_CATEGORY_INFO, TopicCategory
from .text_stats import compute_text_stats

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
    emotionScores: dict[str, float] = {}


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


class PersonItem(BaseModel):
    person: str
    count: int


class PersonsRequest(BaseModel):
    texts: list[TextItem]
    top_n: int = 20


class PersonsResponse(BaseModel):
    persons: list[PersonItem]


@app.post("/analyze/persons", response_model=PersonsResponse)
def analyze_persons(request: PersonsRequest):
    if not classifier:
        return PersonsResponse(persons=[])

    items = [{"id": t.id, "title": t.title, "text": t.text} for t in request.texts]
    persons = classifier.extract_persons_batch(items, top_n=request.top_n)
    return PersonsResponse(persons=[PersonItem(**p) for p in persons])


class TextStatsRequest(BaseModel):
    texts: list[TextItem]
    top_n: int = 50
    lemma_of: list[str] = []


class LemmaCount(BaseModel):
    lemma: str
    pos: str
    count: int


class FormCount(BaseModel):
    form: str
    count: int


class TextStatsResult(BaseModel):
    id: str
    tokens: int
    words: int
    sentences: int
    lemmas: list[LemmaCount]
    forms: dict[str, list[FormCount]]


class TextStatsResponse(BaseModel):
    results: list[TextStatsResult]


@app.post("/analyze/text-stats", response_model=TextStatsResponse)
def analyze_text_stats(request: TextStatsRequest):
    """Counts and lemma frequencies per text, in input order.

    Only the text is analyzed — the title is not part of the document body a
    person counts in.
    """
    if not classifier:
        return TextStatsResponse(results=[])

    docs = classifier.nlp.pipe(
        [t.text for t in request.texts], batch_size=50, n_process=1, disable=["ner"]
    )
    results = [
        TextStatsResult(
            id=item.id,
            **compute_text_stats(doc, top_n=request.top_n, lemma_of=request.lemma_of),
        )
        for doc, item in zip(docs, request.texts)
    ]
    return TextStatsResponse(results=results)
