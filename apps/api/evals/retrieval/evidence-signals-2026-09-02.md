# Evidence-signal calibration (refs #3140)

Depth `deep`, live Qdrant + reranker, 15 cases (9 on-topic, 6 off-topic).

| id                             | group     | candidates | denseTop | denseMedian | denseMargin | rerankTop | rerankMedian | rerankMargin | rerankTop3Mean | aboveThresholdShare | goldRank |
| ------------------------------ | --------- | ---------- | -------- | ----------- | ----------- | --------- | ------------ | ------------ | -------------- | ------------------- | -------- |
| notebook-berlin-hitzeschutz    | on-topic  | 40         | 0.9895   | 0.9414      | 0.0481      | 0.7604    | 0.4164       | 0.3439       | 0.6282         | 1.0000              | 1        |
| notebook-berlin-milieuschutz   | on-topic  | 40         | 1.0000   | 1.0000      | 0.0000      | 0.8703    | 0.5630       | 0.3073       | 0.7690         | 1.0000              | 2        |
| notebook-bayern-moorschutz     | on-topic  | 40         | 1.0000   | 0.9577      | 0.0423      | 0.9478    | 0.6082       | 0.3396       | 0.8044         | 1.0000              | 3        |
| notebook-at-klimaticket        | on-topic  | 30         | 0.9619   | 0.9472      | 0.0147      | 0.5609    | 0.3200       | 0.2410       | 0.5044         | 1.0000              | 1        |
| notebook-user-ausschreibungen  | on-topic  | 20         | 0.9803   | 0.9447      | 0.0356      | 0.7798    | 0.1949       | 0.5849       | 0.6238         | 0.5000              | 1        |
| notebook-user-haushaltsplan    | on-topic  | 11         | 1.0000   | 1.0000      | 0.0000      | 0.6251    | 0.3111       | 0.3140       | 0.6121         | 0.9091              | 2        |
| notebook-history-moorschutz    | on-topic  | 60         | 0.9861   | 0.8964      | 0.0897      | 0.9476    | 0.6051       | 0.3425       | 0.8384         | 1.0000              | 2        |
| notebook-history-flaechenfrass | on-topic  | 60         | 0.9957   | 0.8841      | 0.1117      | 0.7510    | 0.4836       | 0.2674       | 0.7117         | 1.0000              | 1        |
| notebook-history-artenvielfalt | on-topic  | 60         | 1.0000   | 0.9623      | 0.0377      | 0.8569    | 0.5503       | 0.3066       | 0.8204         | 1.0000              | 3        |
| offtopic-sauerteigbrot         | off-topic | 40         | 0.8535   | 0.8484      | 0.0051      | 0.7878    | 0.4978       | 0.2899       | 0.7612         | 1.0000              | —        |
| offtopic-fussball-wm-2014      | off-topic | 40         | 0.8684   | 0.8641      | 0.0043      | 0.8002    | 0.4848       | 0.3154       | 0.7060         | 1.0000              | —        |
| offtopic-tesla-model-3         | off-topic | 40         | 0.8813   | 0.8159      | 0.0653      | 0.9310    | 0.5998       | 0.3313       | 0.7671         | 1.0000              | —        |
| offtopic-mars-distance         | off-topic | 40         | 0.8955   | 0.8462      | 0.0493      | 0.8135    | 0.4926       | 0.3208       | 0.6816         | 1.0000              | —        |
| offtopic-carbonara             | off-topic | 40         | 0.8445   | 0.7971      | 0.0473      | 0.9634    | 0.4594       | 0.5039       | 0.8940         | 1.0000              | —        |
| offtopic-bitcoin-mining        | off-topic | 40         | 0.8488   | 0.8142      | 0.0346      | 0.8523    | 0.5056       | 0.3467       | 0.7199         | 1.0000              | —        |

## Separation

- candidates: does not separate — closest margin -20.0000 (negative = overlapping ranges)
- denseTop: SEPARATES (on-topic > off-topic) — margin 0.0664, threshold ≈ 0.9287 (midpoint of the boundary values)
- denseMedian: SEPARATES (on-topic > off-topic) — margin 0.0200, threshold ≈ 0.8741 (midpoint of the boundary values)
- denseMargin: does not separate — closest margin -0.0653 (negative = overlapping ranges)
- rerankTop: does not separate — closest margin -0.1601 (negative = overlapping ranges)
- rerankMedian: does not separate — closest margin -0.1488 (negative = overlapping ranges)
- rerankMargin: does not separate — closest margin -0.2630 (negative = overlapping ranges)
- rerankTop3Mean: does not separate — closest margin -0.1568 (negative = overlapping ranges)
- aboveThresholdShare: does not separate — closest margin 0.0000 (negative = overlapping ranges)
