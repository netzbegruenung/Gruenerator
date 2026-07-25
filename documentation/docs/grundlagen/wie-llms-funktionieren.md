---
sidebar_position: 1
---

# Grundlagen

Ein großes Sprachmodell, wie zum Beispiel ChatGPT , ist ein KI-Modell, das darauf trainiert ist, menschenähnlichen Text zu verstehen und zu erzeugen. Es ist im Kern eine hochentwickelte Anwendung von **Sprachverarbeitung (NLP), maschinellem Lernen und Deep Learning**.

In vielen Filmen und Serien, insbesondere Kinderfilmen, gibt es die Rolle des alten weisen Mannes oder der alten weisen Frau, die als Mentor oder Mentorin gilt. Diese Leute haben über viele Jahre unfassbar viel gelesen, unfassbar viel Wissen angehäuft. Stellt euch ein LLM grundsätzlich so ähnlich vor, nur eben viel viel schneller trainiert.

## Die Bausteine: Neuronale Netzwerke

Der wichtigste Bestandteil eines LLM ist ein **neuronales Netzwerk**. Stellt euch das wie ein riesiges, komplexes Rechenmodell vor, das die Funktionsweise des menschlichen Gehirns nachahmt. Es besteht aus vielen miteinander verbundenen "Einheiten", die man als **Neuronen** bezeichnen könnte. Diese Neuronen sind über "Verbindungen" miteinander verknüpft, denen **Gewichte** zugewiesen sind. Jedes Neuron empfängt Informationen und gibt basierend auf einfachen Regeln eine Ausgabe weiter. Das Netzwerk lernt, indem es diese Gewichte anpasst – so wie wir durch Erfahrung lernen, unsere Reaktionen zu verfeinern.

## Der Lernprozess (Training)

Damit ein LLM menschenähnlich sprechen kann, muss es "lernen". Dieser Lernprozess, das **Training**, ist entscheidend:

- **Riesige Datenmengen:** Modelle wie GPT-4, das lange Zeit die Basis für ChatGPT bildete, wurden mit gigantischen Textmengen trainiert – für GPT-4 waren das 300 Milliarden Wörter. Diese Texte stammen aus dem Internet, aber das Modell weiß nicht, welche spezifischen Dokumente Teil seines Trainings waren. Es lernt daraus Sprachmuster, Grammatik, Fakten und Zusammenhänge, ohne diese explizit als Regeln programmiert bekommen zu haben.
- **Menschliche Aufsicht:** Der Lernprozess wird oft durch menschliches Feedback verbessert. Das Modell erhält positives oder negatives Feedback zu seinen Antworten, wodurch es seine Fähigkeiten weiter verfeinert, kohärentere und passendere Texte zu erzeugen.
- **Hyperparameter:** Das sind wie die "Lernregeln" des Modells. Sie beeinflussen, wie schnell und präzise das Modell lernt, indem sie ihm helfen, den Kontext besser zu erkennen und verschiedene Eingaben und Ausgaben zu verwalten.

Das **Transformer-Modell** ist die spezielle Architektur eines neuronalen Netzwerks, die bei ChatGPT zum Einsatz kommt und besonders gut darin ist, zusammenhängende Textsequenzen zu verarbeiten und zu generieren.

## Wie ein LLM eine Antwort generiert

Nehmen wir an, wir stellen chatgpt diese Frage: **„Wie können wir die Luftqualität in unserer Kommune nachhaltig verbessern?"**

Wie würde ChatGPT diese Frage beantworten?

### 1. Eingabeverarbeitung (Input Embedding & Tokenisierung)

Zuerst wird die Frage in kleinere "Bausteine" zerlegt, was man **Tokenisierung** nennt. Aus dem Satz werden einzelne Wörter wie "Wie", "können", "Luftqualität", "Stadtgemeinde" usw gezogen.

Jeder dieser Bausteine wird dann in eine Reihe von Zahlen umgewandelt – einen **numerischen Vektor**. Stell dir vor, dass Wörtern mit ähnlicher Bedeutung auch ähnliche Zahlen zugewiesen werden. So könnte der Zahlencode für "Luftqualität" nah am Code für "Emissionen" oder "Feinstaub" liegen, während "Kommunen" auf den lokalen Kontext hinweist.

### 2. Kontext erfassen (Encoder)

Die Sequenz dieser Zahlencodes wird dann von einem Teil des Modells, dem **Encoder**, verarbeitet. Dieser Encoder "liest" die Abfolge der Bausteine und erfasst die Beziehungen zwischen ihnen, um den gesamten Kontext und die Bedeutung Ihrer Frage zu verstehen. Er erkennt also, dass es um die **nachhaltige Verbesserung der Luftqualität innerhalb einer Kommune** geht.

### 3. Antwort-Ideen entwickeln (Decoder)

Die vom Encoder verstandene Information wird an einen anderen Teil des Modells, den **Decoder**, weitergegeben. Der Decoder beginnt nun, eine Sequenz von Zahlencodes zu generieren, die potenzielle Lösungsansätze für Ihre Frage darstellen. Das könnten Ideen sein wie "Ausbau des öffentlichen Nahverkehrs", "Förderung von Elektromobilität", "Erweiterung von Grünflächen" oder "Einführung strengerer Emissionsstandards für Unternehmen".

### 4. Fokus setzen (Aufmerksamkeitsmechanismus)

Während der Decoder diese Lösungsansätze generiert, nutzt er einen **Aufmerksamkeitsmechanismus**. Das ist wie ein Spotlight, das sich selektiv auf die Teile Ihrer ursprünglichen Frage konzentriert, die für die gerade erzeugte Antwort am relevantesten sind. Wenn das Modell beispielsweise "Ausbau des öffentlichen Nahverkehrs" vorschlägt, könnte sich der Fokus auf die Wörter "Luftqualität" und "Kommune" in Ihrer Frage richten, da dies direkt mit der Lösung in Verbindung steht. Dies hilft dem Modell, maßgeschneiderte Antworten zu geben.

### 5. Wahrscheinlichkeiten abwägen (Output Projection)

Zuletzt werden die vom Decoder erzeugten Zahlencodes durch weitere Schichten geleitet, die eine **Wahrscheinlichkeitsverteilung** über mögliche nächste Wörter oder Lösungsvorschläge erzeugen. Das Modell wählt dann das Wort oder die Phrase aus, die am wahrscheinlichsten ist, basierend auf dem, was es gelernt hat. Dieser Prozess wird Wort für Wort wiederholt, bis eine vollständige und kohärente Antwort generiert wurde.

## Neuere Modelle wie GPT-4 können noch mehr:

- **Internetverbindung:** Sie können sich mit dem Internet verbinden, um auf aktuelle Informationen zuzugreifen und so relevantere und aktuellere Antworten zu geben.
- **Plugins:** Sie können mit zusätzlichen Software-Tools, sogenannten **Plugins**, erweitert werden. Diese Plugins ermöglichen dem Modell, neue Funktionen zu nutzen, wie zum Beispiel Bilder zu generieren, Sprachen zu übersetzen oder sogar Musik zu komponieren.
- **Multimodalität:** GPT-4 ist **multimodal**, was bedeutet, dass es Informationen in verschiedenen Formen verarbeiten und erzeugen kann. Es kann beispielsweise Fragen zu Bildern beantworten oder Bilder aus Textbeschreibungen erstellen.

## Quelle

Dieser Grünerator-Guide basiert auf wissenschaftlichen Erkenntnissen aus:

Briganti, G. (2024). [How ChatGPT works: a mini review](https://link.springer.com/article/10.1007/s00405-023-08337-7). _European Archives of Oto-Rhino-Laryngology_, 281, 1565–1569.
