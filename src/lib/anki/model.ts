import { ankiInvoke } from './connect';

// Felder des Notiztyps. Reihenfolge = Anki-Feldreihenfolge.
export const MODEL_FIELDS = [
  'Hanzi',
  'Pinyin',
  'Meaning', // kurze Kontext-Uebersetzung
  'Meanings', // vollstaendige Bedeutungsliste (HTML)
  'SentenceHanzi',
  'SentencePinyin',
  'SentenceTranslation',
  'Source', // HTML-Link mit Zeitstempel
  'Frequency',
  'StrokeData', // HanziWriter-Daten (JSON) fuer die Strichfolge-Animation
] as const;

// Gemeinsame Bausteine ------------------------------------------------------

const HEADER = `<div id="header"><h6>{{Deck}}</h6></div>`;

const SATZ_BLOCK = `{{#SentenceHanzi}}
<div class="satz">
  <div class="satz-hanzi" lang="zh-CN">{{SentenceHanzi}}</div>
  {{#SentencePinyin}}<div class="satz-pinyin">{{SentencePinyin}}</div>{{/SentencePinyin}}
  {{#SentenceTranslation}}<div class="satz-trans">{{SentenceTranslation}}</div>{{/SentenceTranslation}}
</div>
{{/SentenceHanzi}}`;

const FOOTER = `<div id="footer">
  {{#Frequency}}<div class="frequenz">Frequency: {{Frequency}}</div>{{/Frequency}}
  {{#Source}}<div class="quelle">{{Source}}</div>{{/Source}}
</div>`;

// Audio-Button als zentrierter Block (sonst rutscht er neben die Antwort-Box).
const AUDIO = `<div class="audio">{{tts zh_CN:Hanzi}}</div>`;
const AUDIO_PROMPT = `<div class="audio audio-prompt">{{tts zh_CN:Hanzi}}</div>`;

// Strichfolge-Animation (HanziWriter), offline aus eingebetteten Daten.
// Pro CJK-Zeichen eine Flaeche, Klick/Tipp spielt die Strichfolge ab.
const STROKE_BLOCK = `{{#StrokeData}}
<div class="stroke-wrap">
  <div class="stroke-hint">Stroke order (tap)</div>
  <div id="lr2a-so" class="stroke-order" data-hanzi="{{text:Hanzi}}"></div>
  <div id="lr2a-so-data" hidden>{{StrokeData}}</div>
</div>
<script src="_hanzi-writer.min.js"></script>
<script>
(function(){
  function init(){
    if(typeof HanziWriter==="undefined"){return setTimeout(init,60);}
    var host=document.getElementById("lr2a-so");
    var dataEl=document.getElementById("lr2a-so-data");
    if(!host||!dataEl||host.dataset.done){return;}
    host.dataset.done="1";
    var DATA={};
    try{DATA=JSON.parse(dataEl.textContent||"{}");}catch(e){return;}
    var night=document.body.classList.contains("night_mode")||document.body.classList.contains("nightMode");
    var stroke=night?"#e39a9a":"#9b5d5d";
    var outline=night?"#444":"#ddd";
    var chars=(host.dataset.hanzi||"").split("").filter(function(c){return DATA[c];});
    host.innerHTML="";
    chars.forEach(function(c){
      var box=document.createElement("div");
      box.className="so-char";
      host.appendChild(box);
      var w=HanziWriter.create(box,c,{width:96,height:96,padding:5,
        showCharacter:true,showOutline:true,
        strokeColor:stroke,outlineColor:outline,
        strokeAnimationSpeed:1,delayBetweenStrokes:120,
        charDataLoader:function(ch,onLoad){onLoad(DATA[ch]);}});
      box.addEventListener("click",function(){w.animateCharacter();});
    });
  }
  init();
})();
</script>
{{/StrokeData}}`;

// Karte 1: LESEN - Hanzi erkennen. Pinyin per hint aufdeckbar, kein Audio vorne.
const READING_FRONT = `${HEADER}
<div class="hanzi" lang="zh-CN">{{Hanzi}}</div>
<div class="hint-line pinyin-hint">{{hint:Pinyin}}</div>`;

const READING_BACK = `${HEADER}
<div class="hanzi" lang="zh-CN">{{Hanzi}}</div>
<hr id="answer">
<div id="body">
  {{#Pinyin}}<div class="pinyin">{{Pinyin}}</div>{{/Pinyin}}
  <div class="bedeutung">{{Meaning}}</div>
  {{#Meanings}}<div class="bedeutungen">{{Meanings}}</div>{{/Meanings}}
  ${SATZ_BLOCK}
</div>
${AUDIO}
${STROKE_BLOCK}
${FOOTER}`;

// Karte 2: UEBERSETZEN - von der Meaning aufs Chinesische kommen.
const TRANSLATING_FRONT = `${HEADER}
<div class="bedeutung-prompt">{{Meaning}}</div>`;

const TRANSLATING_BACK = `{{FrontSide}}
<hr id="answer">
<div id="body">
  <div class="hanzi" lang="zh-CN">{{Hanzi}}</div>
  {{#Pinyin}}<div class="pinyin">{{Pinyin}}</div>{{/Pinyin}}
  ${SATZ_BLOCK}
</div>
${AUDIO}
${STROKE_BLOCK}
${FOOTER}`;

// Karte 3: HOEREN - nur Audio als Prompt, Hanzi/Pinyin per hint peekbar.
const LISTENING_FRONT = `${HEADER}
${AUDIO_PROMPT}
<div class="hint-line hanzi-hint">{{hint:Hanzi}}</div>
<div class="hint-line pinyin-hint">{{hint:Pinyin}}</div>`;

const LISTENING_BACK = `${HEADER}
<hr id="answer">
<div id="body">
  <div class="hanzi" lang="zh-CN">{{Hanzi}}</div>
  {{#Pinyin}}<div class="pinyin">{{Pinyin}}</div>{{/Pinyin}}
  <div class="bedeutung">{{Meaning}}</div>
  {{#Meanings}}<div class="bedeutungen">{{Meanings}}</div>{{/Meanings}}
  ${SATZ_BLOCK}
</div>
${STROKE_BLOCK}
${FOOTER}`;

export interface CardTemplate {
  Name: string;
  Front: string;
  Back: string;
}

export const CARD_TEMPLATES: CardTemplate[] = [
  { Name: 'Reading', Front: READING_FRONT, Back: READING_BACK },
  { Name: 'Translating', Front: TRANSLATING_FRONT, Back: TRANSLATING_BACK },
  { Name: 'Listening', Front: LISTENING_FRONT, Back: LISTENING_BACK },
];

// Pimsleur-inspiriert: Antwort in abgerundeter Box, gedaempfte Farben,
// Hanzi roetlich / Pinyin blau / Uebersetzung gruen. Mit Dark-Mode.
const BASE_CSS = `
.card {
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: 15px;
  text-align: center;
  color: #666;
  background-color: #efefe9;
  padding: 16px 12px;
}
.night_mode.card, .night_mode .card { color: #b8b8c0; background-color: #1b1b20; }

#header, #footer { color: #9a9a90; margin: 0 0 1em; }
#footer { margin: 1em 0 0; }
h6 { font-size: 0.72em; font-weight: normal; margin: 0; }
h1, h2, h3, h4, p { font-weight: normal; margin: 0; }


.hanzi {
  font-family: "PingFang SC", "Noto Sans CJK SC", "Songti SC", sans-serif;
  font-size: 56px; line-height: 1.2; color: #9b5d5d; word-spacing: .35em;
  margin: 10px 0;
}
.night_mode .hanzi { color: #e39a9a; }

.pinyin { font-size: 24px; color: #5c5c99; margin: 4px 0; }
.night_mode .pinyin { color: #a6a6ec; }

.bedeutung { font-size: 22px; color: #bf6a00; margin: 6px 0; }
.night_mode .bedeutung { color: #e0a35a; }
.bedeutung-prompt { font-size: 30px; color: #bf6a00; margin: 28px 0; }
.night_mode .bedeutung-prompt { color: #e0a35a; }

.hint-line { margin: 12px 0; }
a.hint { color: #9a9a4d; text-decoration: none; font-size: 20px; }
.night_mode a.hint { color: #cccc7a; }

/* Hint-Groesse ueber den Container setzen: der enthuellte Text erbt sie,
   der Link (a.hint) wird klein zurueckgesetzt - unabhaengig vom Markup,
   das Anki fuer den enthuellten Inhalt verwendet. */
.hanzi-hint {
  font-family: "PingFang SC", "Noto Sans CJK SC", "Songti SC", sans-serif;
  font-size: 52px; color: #9b5d5d; word-spacing: .35em; line-height: 1.2;
}
.night_mode .hanzi-hint { color: #e39a9a; }
.pinyin-hint { font-size: 24px; color: #5c5c99; }
.night_mode .pinyin-hint { color: #a6a6ec; }
.hint-line a.hint {
  font-size: 20px; color: #9a9a4d; font-family: Georgia, serif; word-spacing: normal;
}
.night_mode .hint-line a.hint { color: #cccc7a; }

/* Audio-Button zentriert als eigener Block. */
.audio { text-align: center; margin: 12px 0; }
.audio-prompt { margin: 16px 0; }
.audio-prompt svg, .audio-prompt .replay-button { width: 46px; height: 46px; }

/* Strichfolge-Animation. */
.stroke-wrap { margin: 14px 0 2px; }
.stroke-hint { font-size: 11px; color: #a8a89a; margin-bottom: 4px; }
.stroke-order { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.so-char {
  width: 96px; height: 96px; border: 1px dashed #c9c9bd; border-radius: 8px;
  cursor: pointer; background: #fff;
}
.night_mode .so-char { border-color: #3a3a42; background: #1f1f25; }

#body {
  display: inline-block; max-width: 92%; margin: 1em auto; padding: 14px 20px;
  border: 2px solid #d4d4c8; border-radius: 22px;
  box-shadow: 1px 1px 6px 0 rgba(0,0,0,.15);
  background: #fbfbf7;
}
.night_mode #body { border-color: #3a3a42; background: #232329; box-shadow: none; }

.bedeutungen { font-size: 14px; color: #777; margin: 8px auto; max-width: 420px; text-align: left; }
.night_mode .bedeutungen { color: #a8a8b4; }
.bedeutungen ul { margin: 4px 0; padding-left: 20px; }
.bedeutungen .pos { display: inline-block; min-width: 52px; font-style: italic; color: #a09a7a; }

.satz {
  margin: 14px auto 2px; padding: 10px 12px; max-width: 480px;
  background: #f0f0e8; border-radius: 10px;
}
.night_mode .satz { background: #2a2a30; }
.satz-hanzi {
  font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif;
  font-size: 22px; color: #9b5d5d; margin-bottom: 3px;
}
.night_mode .satz-hanzi { color: #e39a9a; }
.satz-pinyin { font-size: 15px; color: #5c5c99; }
.night_mode .satz-pinyin { color: #a6a6ec; }
.satz-trans { font-size: 15px; color: #bf6a00; margin-top: 3px; }
.night_mode .satz-trans { color: #e0a35a; }

.frequenz { font-size: 11px; color: #a8a89a; margin-bottom: 6px; }

.quelle { font-size: 11px; word-break: break-all; }
.quelle a { color: #6a8ab0; text-decoration: none; }
.quelle-zeit { color: #a8a89a; white-space: nowrap; }

hr { border: 0; height: .5em; margin: 0; background: none; }
#answer { height: 0; border: 0; border-top: 1px solid #d9d9cf; margin: 14px auto; max-width: 420px; }
.night_mode #answer { border-top-color: #33333c; }
`.trim();

// Tonfarben (Pleco-Schema). Werden nur eingebunden, wenn die Option aktiv ist.
const TONE_CSS = `
.tone1 { color: #c62828; }
.tone2 { color: #2e7d32; }
.tone3 { color: #1565c0; }
.tone4 { color: #6a1b9a; }
.tone5 { color: #757575; }
.night_mode .tone1 { color: #ef5350; }
.night_mode .tone2 { color: #66bb6a; }
.night_mode .tone3 { color: #42a5f5; }
.night_mode .tone4 { color: #ab47bc; }
.night_mode .tone5 { color: #bdbdbd; }
`.trim();

/** CSS des Notiztyps, optional mit Pinyin-Tonfarben. */
export function buildModelCss(toneColors: boolean): string {
  return toneColors ? `${BASE_CSS}\n\n${TONE_CSS}` : BASE_CSS;
}

function templatesByName(): Record<string, { Front: string; Back: string }> {
  const out: Record<string, { Front: string; Back: string }> = {};
  for (const t of CARD_TEMPLATES) out[t.Name] = { Front: t.Front, Back: t.Back };
  return out;
}

/**
 * Stellt sicher, dass der Notiztyp existiert und Templates/CSS aktuell sind.
 * Neu -> createModel. Vorhanden mit passenden Template-Namen -> aktualisieren.
 * Vorhanden mit abweichenden Templates -> nur Styling, da Anki kein nachtraegliches
 * Hinzufuegen von Templates per API erlaubt (dafuer neuen modelName verwenden).
 */
export async function ensureModel(
  modelName: string,
  baseUrl: string,
  toneColors = true,
): Promise<void> {
  const css = buildModelCss(toneColors);
  const names = await ankiInvoke<string[]>('modelNames', {}, baseUrl);
  if (!names.includes(modelName)) {
    await ankiInvoke(
      'createModel',
      {
        modelName,
        inOrderFields: [...MODEL_FIELDS],
        css,
        isCloze: false,
        cardTemplates: CARD_TEMPLATES,
      },
      baseUrl,
    );
    return;
  }

  // Fehlende Felder ergaenzen (z.B. StrokeData bei aelteren Notiztypen).
  const fieldNames = await ankiInvoke<string[]>('modelFieldNames', { modelName }, baseUrl);
  for (const f of MODEL_FIELDS) {
    if (!fieldNames.includes(f)) {
      await ankiInvoke(
        'modelFieldAdd',
        { modelName, fieldName: f, index: fieldNames.length },
        baseUrl,
      );
      fieldNames.push(f);
    }
  }

  const existing = await ankiInvoke<Record<string, unknown>>(
    'modelTemplates',
    { modelName },
    baseUrl,
  );
  const existingNames = Object.keys(existing).sort().join('|');
  const desiredNames = CARD_TEMPLATES.map((t) => t.Name).sort().join('|');
  if (existingNames === desiredNames) {
    await ankiInvoke(
      'updateModelTemplates',
      { model: { name: modelName, templates: templatesByName() } },
      baseUrl,
    );
  } else {
    console.warn(
      `[lr2anki] Note type "${modelName}" has different templates (${existingNames}). ` +
        'Templates are not migrated automatically - use a new modelName if needed.',
    );
  }
  await ankiInvoke('updateModelStyling', { model: { name: modelName, css } }, baseUrl);
}
