// ==UserScript==
// @name         Quizizz Bypass
// @version      34.0
// @description  Resolve questões do Quizizz com correção de bug no controle de timeout.
// @author       mzzvxm
// @icon         https://tse1.mm.bing.net/th/id/OIP.Ydweh29BuHk_PGD4dGJXbAHaHa?rs=1&pid=ImgDetMain&o=7&rm=3
// @match        https://wayground.com/join/game/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // -----------------------------------------------------------------------------------
    // IMPORTANTE: LISTA DE CHAVES DE API
    // -----------------------------------------------------------------------------------
    const GEMINI_API_KEYS = [
        "CHAVE1",   // Chave 1
        "CHAVE2",  // Chave 2
        "CHAVE3"  // Chave 3
    ];
    let currentApiKeyIndex = 0;
    let lastAiResponse = '';
    // -----------------------------------------------------------------------------------

    function waitForElement(selector, all = false, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                const elements = all ? document.querySelectorAll(selector) : document.querySelector(selector);
                if ((all && elements.length > 0) || (!all && elements)) {
                    clearInterval(interval);
                    resolve(elements);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    reject(new Error(`Elemento(s) "${selector}" não encontrado(s) após ${timeout / 1000} segundos.`));
                }
            }, 100);
        });
    }

    function extrairDadosDaQuestao() {
        try {
            const questionTextElement = document.querySelector('#questionText .question-text-color');
            const questionText = questionTextElement ? questionTextElement.innerText.trim().replace(/\s+/g, ' ') : "Não foi possível encontrar o texto da pergunta.";
            const questionImageElement = document.querySelector('img[data-testid="question-container-image"]');
            const questionImageUrl = questionImageElement ? questionImageElement.src : null;
            const extractText = (el) => {
                const mathElement = el.querySelector('annotation[encoding="application/x-tex"]');
                return mathElement ? mathElement.textContent.trim() : el.querySelector('#optionText')?.innerText.trim() || '';
            };
            const equationEditor = document.querySelector('div[data-cy="equation-editor"]');
            if (equationEditor) {
                return { questionText, questionImageUrl, questionType: 'equation' };
            }
            const droppableBlanks = document.querySelectorAll('button.droppable-blank');
            const dragOptions = document.querySelectorAll('.drag-option');
            if (droppableBlanks.length > 1 && dragOptions.length > 0) {
                const questionContainer = document.querySelector('.drag-drop-text > div');
                const dropZones = [];
                if (questionContainer) {
                    const children = Array.from(questionContainer.children);
                    for (let i = 0; i < children.length; i++) {
                        const blankButton = children[i].querySelector('button.droppable-blank');
                        if (blankButton) {
                            const precedingSpan = children[i - 1];
                            if (precedingSpan && precedingSpan.tagName === 'SPAN') {
                                let promptText = precedingSpan.innerText.trim().replace(/:\s*$/, '').replace(/\s+/g, ' ');
                                dropZones.push({ prompt: promptText, blankElement: blankButton });
                            }
                        }
                    }
                }
                const draggableOptions = Array.from(dragOptions).map(el => ({ text: el.innerText.trim(), element: el }));
                return { questionText: questionContainer.innerText.trim(), questionImageUrl, questionType: 'multi_drag_into_blank', draggableOptions, dropZones };
            }
            if (droppableBlanks.length === 1 && dragOptions.length > 0) {
                 const draggableOptions = Array.from(dragOptions).map(el => ({ text: el.querySelector('.dnd-option-text')?.innerText.trim() || '', element: el }));
                return { questionText, questionImageUrl, questionType: 'drag_into_blank', draggableOptions, dropZone: { element: droppableBlanks[0] } };
            }
            const dropdownButton = document.querySelector('button.options-dropdown');
            if (dropdownButton) {
                return { questionText, questionImageUrl, questionType: 'dropdown', dropdownButton };
            }
            const matchContainer = document.querySelector('.match-order-options-container');
            if (matchContainer) {
                const draggableItems = Array.from(matchContainer.querySelectorAll('.match-order-option.is-option-tile')).map(el => ({ text: extractText(el), element: el }));
                const dropZones = Array.from(matchContainer.querySelectorAll('.match-order-option.is-drop-tile')).map(el => ({ text: extractText(el), element: el }));
                if (draggableItems.length > 0 && dropZones.length > 0) {
                    const questionType = questionText.toLowerCase().includes('reorder') ? 'reorder' : 'match_order';
                    return { questionText, questionImageUrl, questionType, draggableItems, dropZones };
                }
            }
            const openEndedTextarea = document.querySelector('textarea[data-cy="open-ended-textarea"]');
            if (openEndedTextarea) {
                return { questionText, questionImageUrl, questionType: 'open_ended', answerElement: openEndedTextarea };
            }
            const optionElements = document.querySelectorAll('.option.is-selectable');
            if (optionElements.length > 0) {
                const isMultipleChoice = Array.from(optionElements).some(el => el.classList.contains('is-msq'));
                const options = Array.from(optionElements).map(el => ({ text: extractText(el), element: el }));
                return { questionText, questionImageUrl, questionType: isMultipleChoice ? 'multiple_choice' : 'single_choice', options };
            }
            console.error("Tipo de questão não reconhecido.");
            return null;
        } catch (error) {
            console.error("Erro ao extrair dados da questão:", error);
            return null;
        }
    }

    async function obterRespostaDaIA(quizData) {
        lastAiResponse = '';
        const viewResponseBtn = document.getElementById('view-raw-response-btn');
        if (viewResponseBtn) viewResponseBtn.style.display = 'none';
        for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
            const currentKey = GEMINI_API_KEYS[currentApiKeyIndex];
            if (!currentKey || currentKey.includes("SUA_") || currentKey.length < 30) {
                console.warn(`Chave de API #${currentApiKeyIndex + 1} parece ser um placeholder. Pulando...`);
                currentApiKeyIndex = (currentApiKeyIndex + 1) % GEMINI_API_KEYS.length;
                continue;
            }
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${currentKey}`;
            let promptDeInstrucao = "", formattedOptions = "";
            switch (quizData.questionType) {
                 case 'multi_drag_into_blank': promptDeInstrucao = `Esta é uma questão de combinar múltiplas sentenças com suas expressões corretas. Responda com os pares no formato EXATO: 'Sentença da pergunta -> Expressão da opção', com cada par em uma nova linha.`; const prompts = quizData.dropZones.map(item => `- "${item.prompt}"`).join('\n'); const options = quizData.draggableOptions.map(item => `- "${item.text}"`).join('\n'); formattedOptions = `Sentenças:\n${prompts}\n\nExpressões (Opções):\n${options}`; break;
                case 'equation': promptDeInstrucao = `Resolva a seguinte equação ou inequação. Forneça apenas a expressão final simplificada (ex: x = 5, ou y > 3).`; formattedOptions = `EQUAÇÃO: "${quizData.questionText}"`; break;
                case 'dropdown': case 'single_choice': promptDeInstrucao = `Responda APENAS com o texto exato da ÚNICA alternativa correta.`; formattedOptions = "OPÇÕES:\n" + quizData.options.map(opt => `- "${opt.text}"`).join('\n'); break;
                case 'reorder': promptDeInstrucao = `A tarefa é: "${quizData.questionText}". Forneça a ordem correta listando os textos dos itens, um por linha, do primeiro ao último.`; formattedOptions = "Itens para ordenar:\n" + quizData.draggableItems.map(item => `- "${item.text}"`).join('\n'); break;
                case 'drag_into_blank': promptDeInstrucao = `Responda APENAS com o texto da ÚNICA opção correta que preenche a lacuna.`; formattedOptions = "Opções para arrastar:\n" + quizData.draggableOptions.map(item => `- "${item.text}"`).join('\n'); break;
                case 'match_order': promptDeInstrucao = `Responda com os pares no formato EXATO: 'Texto do Local para Soltar -> Texto do Item para Arrastar', com cada par em uma nova linha.`; const draggables = quizData.draggableItems.map(item => `- "${item.text}"`).join('\n'); const droppables = quizData.dropZones.map(item => `- "${item.text}"`).join('\n'); formattedOptions = `Itens para Arrastar:\n${draggables}\n\nLocais para Soltar:\n${droppables}`; break;
                case 'open_ended': promptDeInstrucao = `Responda APENAS com a palavra ou frase curta que preenche a lacuna.`; break;
                case 'multiple_choice': promptDeInstrucao = `Responda APENAS com os textos exatos de TODAS as alternativas corretas, separando cada uma em uma NOVA LINHA.`; formattedOptions = "OPÇÕES:\n" + quizData.options.map(opt => `- "${opt.text}"`).join('\n'); break;
            }
            const textPrompt = `${promptDeInstrucao}\n\n---\nPERGUNTA: "${quizData.questionText}"\n---\n${formattedOptions}`;
            let promptParts = [{ text: textPrompt }];
            if (quizData.questionImageUrl) {
                const base64Image = await imageUrlToBase64(quizData.questionImageUrl);
                if (base64Image) {
                    const [header, data] = base64Image.split(',');
                    let mimeType = header.match(/:(.*?);/)[1];
                    const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
                    if (!supportedMimeTypes.includes(mimeType)) mimeType = 'image/jpeg';
                    promptParts.push({ inline_data: { mime_type: mimeType, data: data } });
                }
            }
            try {
                const response = await fetchWithTimeout(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: promptParts }] })
                });
                if (response.ok) {
                    const data = await response.json();
                    const aiResponseText = data.candidates[0].content.parts[0].text;
                    console.log(`Sucesso com a Chave API #${currentApiKeyIndex + 1}.`);
                    console.log("Resposta bruta da IA:", aiResponseText);
                    lastAiResponse = aiResponseText;
                    return aiResponseText;
                }
                const errorData = await response.json();
                const errorMessage = errorData.error?.message || `Erro ${response.status}`;
                console.warn(`Chave API #${currentApiKeyIndex + 1} falhou: ${errorMessage}. Tentando a próxima...`);
                lastAiResponse = `Falha na Chave #${currentApiKeyIndex + 1}: ${errorMessage}`;
            } catch (error) {
                console.warn(`Erro na requisição com a Chave API #${currentApiKeyIndex + 1}: ${error.message}. Tentando a próxima...`);
                lastAiResponse = `Falha na Chave #${currentApiKeyIndex + 1}: ${error.message}`;
            }
            currentApiKeyIndex = (currentApiKeyIndex + 1) % GEMINI_API_KEYS.length;
        }
        alert("Todas as chaves de API falharam. Verifique suas chaves e cotas no Google AI Studio.");
        return null;
    }

    async function performAction(aiAnswerText, quizData) {
        if (!aiAnswerText) return;
        const getElementColor = (element) => {
            const style = window.getComputedStyle(element);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage.includes('gradient')) {
                const match = bgImage.match(/rgb\(\d+, \d+, \d+\)/);
                if (match) return match[0];
            }
            return style.backgroundColor || 'rgba(0, 255, 0, 0.5)';
        };
        switch (quizData.questionType) {
            case 'multi_drag_into_blank':
                const highlightColors = ['#FFD700', '#00FFFF', '#FF00FF', '#7FFF00', '#FF8C00', '#DA70D6'];
                let colorIndex = 0;
                const cleanPairPartMulti = (str) => str.replace(/[`"']/g, '').trim();
                const pairingsMulti = aiAnswerText.split('\n').filter(line => line.includes('->')).map(line => {
                    const parts = line.split('->');
                    return parts.length === 2 ? [cleanPairPartMulti(parts[0]), cleanPairPartMulti(parts[1])] : null;
                }).filter(Boolean);
                if (pairingsMulti.length === 0) { console.error("Não foi possível extrair pares válidos da resposta da IA."); return; }
                const draggableMap = new Map(quizData.draggableOptions.map(i => [i.text, i.element]));
                const dropZoneMap = new Map(quizData.dropZones.map(i => [i.prompt, i.blankElement]));
                for (const [promptText, optionText] of pairingsMulti) {
                    const bestPromptMatch = [...dropZoneMap.keys()].find(key => key.includes(promptText) || promptText.includes(key));
                    const blankEl = dropZoneMap.get(bestPromptMatch);
                    const optionEl = draggableMap.get(optionText);
                    if (blankEl && optionEl) {
                        const color = highlightColors[colorIndex % highlightColors.length];
                        const highlightStyle = `box-shadow: 0 0 15px 5px ${color}; border-radius: 4px;`;
                        blankEl.style.cssText = highlightStyle;
                        optionEl.style.cssText = highlightStyle;
                        colorIndex++;
                    } else {
                        console.warn(`Par não encontrado no DOM: "${promptText}" -> "${optionText}"`);
                    }
                }
                break;
            case 'equation':
                const KEYPAD_MAP = {
                    '0': 'icon-fas-0', '1': 'icon-fas-1', '2': 'icon-fas-2', '3': 'icon-fas-3', '4': 'icon-fas-4',
                    '5': 'icon-fas-5', '6': 'icon-fas-6', '7': 'icon-fas-7', '8': 'icon-fas-8', '9': 'icon-fas-9',
                    '+': 'icon-fas-plus', '-': 'icon-fas-minus', '*': 'icon-fas-times', '×': 'icon-fas-times',
                    '/': 'icon-fas-divide', '÷': 'icon-fas-divide', '=': 'icon-fas-equals', '.': 'icon-fas-period',
                    '<': 'icon-fas-less-than', '>': 'icon-fas-greater-than',
                    '≤': 'icon-fas-less-than-equal', '≥': 'icon-fas-greater-than-equal',
                    'x': 'icon-fas-variable', 'y': 'icon-fas-variable', 'z': 'icon-fas-variable',
                    '(': 'icon-fas-brackets-round', ')': 'icon-fas-brackets-round',
                    'π': 'icon-fas-pi', 'e': 'icon-fas-euler',
                };
                let answerSequence = aiAnswerText.trim().replace(/\s/g, '').replace(/<=/g, '≤').replace(/>=/g, '≥');
                console.log(`Digitando a resposta: ${answerSequence}`);
                const editor = document.querySelector('div[data-cy="equation-editor"]');
                if (editor) {
                    editor.click();
                    await new Promise(r => setTimeout(r, 100));
                } else {
                    console.error("Não foi possível encontrar o editor de equação para focar.");
                    return;
                }
                for (const char of answerSequence) {
                    const iconClass = KEYPAD_MAP[char.toLowerCase()];
                    if (iconClass) {
                        const keyElement = document.querySelector(`.editor-button i.${iconClass}`);
                        if (keyElement) {
                            const button = keyElement.closest('button');
                            if (button) {
                                button.click();
                                await new Promise(r => setTimeout(r, 100));
                            }
                        } else {
                            console.error(`Não foi possível encontrar a tecla para o caractere: "${char}" (ícone: ${iconClass})`);
                        }
                    } else {
                        console.error(`Caractere não mapeado no teclado: "${char}"`);
                    }
                }
                break;
            case 'reorder':
                const cleanText = (str) => str.replace(/["'`]/g, '').trim();
                const orderedItems = aiAnswerText.split('\n').map(cleanText).filter(Boolean);
                const draggablesMapReorder = new Map(quizData.draggableItems.map(i => [i.text, i.element]));
                const dropZonesInOrder = quizData.dropZones;
                if (orderedItems.length === dropZonesInOrder.length) {
                    for (let i = 0; i < orderedItems.length; i++) {
                        const sourceText = orderedItems[i];
                        const sourceEl = draggablesMapReorder.get(sourceText);
                        const destinationEl = dropZonesInOrder[i].element;
                        if (sourceEl && destinationEl) {
                            const color = getElementColor(sourceEl);
                            const highlightStyle = `box-shadow: 0 0 15px 5px ${color}; border-radius: 8px;`;
                            sourceEl.style.cssText = highlightStyle;
                            destinationEl.style.cssText = highlightStyle;
                        }
                    }
                }
                break;
            case 'drag_into_blank':
                const cleanAiAnswerBlank = aiAnswerText.trim().replace(/["'`]/g, '');
                const targetOption = quizData.draggableOptions.find(opt => opt.text === cleanAiAnswerBlank);
                if (targetOption) {
                    const color = getElementColor(targetOption.element);
                    const highlightStyle = `box-shadow: 0 0 15px 5px ${color}`;
                    targetOption.element.style.cssText = highlightStyle;
                    quizData.dropZone.element.style.cssText = highlightStyle;
                }
                break;
            case 'match_order':
                const cleanPairPart = (str) => str.replace(/[`"']/g, '').trim();
                const pairings = aiAnswerText.split('\n').filter(line => line.includes('->')).map(line => {
                    const parts = line.split('->');
                    return parts.length === 2 ? [cleanPairPart(parts[0]), cleanPairPart(parts[1])] : null;
                }).filter(Boolean);
                if (pairings.length === 0) { console.error("Não foi possível extrair pares válidos da resposta da IA."); return; }
                const draggablesMapMatch = new Map(quizData.draggableItems.map(i => [i.text, i.element]));
                const dropZonesMap = new Map(quizData.dropZones.map(i => [i.text, i.element]));
                for (const [partA, partB] of pairings) {
                    let sourceEl, destinationEl;
                    if (dropZonesMap.has(partA) && draggablesMapMatch.has(partB)) {
                        destinationEl = dropZonesMap.get(partA);
                        sourceEl = draggablesMapMatch.get(partB);
                    } else if (dropZonesMap.has(partB) && draggablesMapMatch.has(partA)) {
                        destinationEl = dropZonesMap.get(partB);
                        sourceEl = draggablesMapMatch.get(partA);
                    } else { continue; }
                    if (sourceEl && destinationEl) {
                        const color = getElementColor(sourceEl);
                        const highlightStyle = `box-shadow: 0 0 15px 5px ${color}; border-radius: 8px;`;
                        sourceEl.style.cssText = highlightStyle;
                        destinationEl.style.cssText = highlightStyle;
                    }
                }
                break;
            default:
                const normalize = (str) => {
                    if (typeof str !== 'string') return '';
                    let cleaned = str.replace(/[^a-zA-Z\u00C0-\u017F\s]/g, '').replace(/\s+/g, ' ');
                    return cleaned.trim().toLowerCase();
                };
                if (quizData.questionType === 'open_ended') {
                    await new Promise(resolve => {
                        quizData.answerElement.focus();
                        quizData.answerElement.value = aiAnswerText.trim();
                        quizData.answerElement.dispatchEvent(new Event('input', { bubbles: true }));
                        setTimeout(resolve, 100);
                    });
                    setTimeout(() => document.querySelector('.submit-button-wrapper button, button.submit-btn')?.click(), 500);
                } else if (quizData.questionType === 'multiple_choice') {
                    const aiAnswers = aiAnswerText.split('\n').map(normalize).filter(Boolean);
                    quizData.options.forEach(opt => {
                        if (aiAnswers.includes(normalize(opt.text))) {
                            opt.element.style.border = '5px solid #00FF00';
                            opt.element.click();
                        }
                    });
                } else if (quizData.questionType === 'single_choice') {
                    const normalizedAiAnswer = normalize(aiAnswerText);
                    const bestMatch = quizData.options.find(opt => normalize(opt.text) === normalizedAiAnswer);
                    if (bestMatch) {
                        bestMatch.element.style.border = '5px solid #00FF00';
                        bestMatch.element.click();
                    }
                }
                break;
        }
    }

    async function resolverQuestao() {
        const button = document.getElementById('ai-solver-button');
        button.disabled = true;
        button.innerText = "Pensando...";
        button.style.transform = 'scale(0.95)';
        button.style.boxShadow = '0 0 0 rgba(0,0,0,0)';
        try {
            const quizData = await extrairDadosDaQuestao();
            if (!quizData) {
                alert("Não foi possível extrair os dados da questão.");
                return;
            }
            if (quizData.questionType === 'dropdown') {
                console.log("Iniciando fluxo otimizado para Dropdown...");
                quizData.dropdownButton.click();
                try {
                    const optionElements = await waitForElement('.v-popper__popper--shown button.dropdown-option', true);
                    quizData.options = Array.from(optionElements).map(el => ({ text: el.innerText.trim() }));
                    const aiAnswer = await obterRespostaDaIA(quizData);
                    if (aiAnswer) {
                        const cleanAiAnswerDrop = aiAnswer.trim().replace(/["'`]/g, '');
                        const targetOptionDrop = Array.from(optionElements).find(el => el.innerText.trim() === cleanAiAnswerDrop);
                        if (targetOptionDrop) {
                            targetOptionDrop.click();
                        } else {
                            console.error(`Não foi possível encontrar a opção dropdown com o texto: "${cleanAiAnswerDrop}"`);
                            document.body.click();
                        }
                    } else {
                         document.body.click();
                    }
                } catch (error) {
                    console.error("Falha ao processar o dropdown:", error.message);
                    document.body.click();
                }
            } else {
                const isMath = quizData.options && quizData.options.length > 0 && (quizData.options[0].text.includes('\\') || quizData.questionText.toLowerCase().includes('value of'));
                const matchValue = quizData.questionText.match(/value of ([\d.]+)/i);
                if (isMath && matchValue) {
                    console.log("Questão de matemática detectada. Resolvendo localmente...");
                    const targetValue = parseFloat(matchValue[1]);
                    quizData.options.forEach(option => {
                        const computableExpr = (() => {
                            let c = option.text.replace(/\\left/g, '').replace(/\\right/g, '').replace(/\\div/g, '/').replace(/\\times/g, '*').replace(/\\ /g, '').replace(/(\d+)\s*\(/g, '$1 * (').replace(/\)\s*(\d+)/g, ') * $1');
                            c = c.replace(/(\d+)\\frac\{(\d+)\}\{(\d+)\}/g, '($1+$2/$3)');
                            c = c.replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '($1/$2)');
                            return c;
                        })();
                        const result = (() => { try { return new Function('return ' + computableExpr)(); } catch (e) { return null; } })();
                        if (result !== null && Math.abs(result - targetValue) < 0.001) {
                            option.element.style.border = '5px solid #00FF00';
                            option.element.click();
                        }
                    });
                } else {
                    console.log("Usando IA para resolver...");
                    const aiAnswer = await obterRespostaDaIA(quizData);
                    if (aiAnswer) {
                        await performAction(aiAnswer, quizData);
                    }
                }
            }
        } catch (error) {
            console.error("Um erro inesperado ocorreu no fluxo principal:", error);
            alert("Ocorreu um erro geral. Verifique o console para detalhes.");
        } finally {
            const viewResponseBtn = document.getElementById('view-raw-response-btn');
            if (viewResponseBtn && lastAiResponse) {
                viewResponseBtn.style.display = 'block';
            }
            button.disabled = false;
            button.innerText = "✨ Resolver";
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        }
    }

    function criarFloatingPanel() {
        if (document.getElementById('mzzvxm-floating-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'mzzvxm-floating-panel';
        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483647',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch',
            gap: '10px', padding: '12px', backgroundColor: 'rgba(26, 27, 30, 0.7)',
            backdropFilter: 'blur(8px)', webkitBackdropFilter: 'blur(8px)', borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
            transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
            transform: 'translateY(20px)', opacity: '0'
        });

        const responseViewer = document.createElement('div');
        responseViewer.id = 'ai-response-viewer';
        Object.assign(responseViewer.style, {
            display: 'none', position: 'absolute', bottom: 'calc(100% + 10px)', right: '0',
            width: '300px', maxHeight: '200px', overflowY: 'auto',
            background: 'rgba(10, 10, 15, 0.9)', backdropFilter: 'blur(5px)',
            borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '12px', color: '#f0f0f0', fontSize: '12px',
            fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
            textAlign: 'left'
        });
        panel.appendChild(responseViewer);
        
        const viewResponseBtn = document.createElement('button');
        viewResponseBtn.id = 'view-raw-response-btn';
        viewResponseBtn.innerText = 'Ver Resposta da IA';
        Object.assign(viewResponseBtn.style, {
            background: 'none', border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer',
            fontSize: '11px', padding: '4px 8px', borderRadius: '6px',
            display: 'none', transition: 'all 0.2s ease',
            marginBottom: '4px'
        });
        viewResponseBtn.addEventListener('click', () => {
            if (responseViewer.style.display === 'block') {
                responseViewer.style.display = 'none';
            } else {
                responseViewer.innerText = lastAiResponse || "Nenhuma resposta da IA foi recebida ainda.";
                responseViewer.style.display = 'block';
            }
        });
        panel.appendChild(viewResponseBtn);
        
        const button = document.createElement('button');
        button.id = 'ai-solver-button';
        button.innerHTML = '✨ Resolver';
        Object.assign(button.style, {
            background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
            border: 'none', borderRadius: '10px', color: 'white', cursor: 'pointer',
            fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontWeight: '600',
            padding: '10px 20px', boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.2s ease', letterSpacing: '0.5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
        });
        button.addEventListener('mouseover', () => { button.style.transform = 'translateY(-2px)'; button.style.boxShadow = '0 6px 15px rgba(0, 0, 0, 0.3)'; });
        button.addEventListener('mouseout', () => { button.style.transform = 'translateY(0)'; button.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.2)'; });
        button.addEventListener('mousedown', () => { button.style.transform = 'translateY(1px)'; button.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.15)'; });
        button.addEventListener('mouseup', () => { button.style.transform = 'translateY(-2px)'; button.style.boxShadow = '0 6px 15px rgba(0, 0, 0, 0.3)'; });
        button.addEventListener('click', resolverQuestao);
        panel.appendChild(button);
        
        const watermark = document.createElement('div');
        const githubIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 3c-.58.0-1.25.27-2 1.5c-2.2.86-4.5 1.3-7 1.3-2.5 0-4.7-.44-7-1.3-.75-1.23-1.42-1.5-2-1.5A5.07 5.07 0 0 0 4 4.77 5.44 5.44 0 0 0 2 10.71c0 6.13 3.49 7.34 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>`;
        const instagramIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`;
        watermark.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center; color: rgba(255,255,255,0.7); margin-top: 8px; justify-content: flex-end;">
                <span style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; font-weight: 400;">@mzzvxm</span>
                <a href="https://github.com/mzzvxm" target="_blank" title="GitHub" style="line-height: 0; color: inherit; transition: color 0.2s ease;">${githubIcon}</a>
                <a href="https://instagram.com/mzzvxm" target="_blank" title="Instagram" style="line-height: 0; color: inherit; transition: color 0.2s ease;">${instagramIcon}</a>
            </div>
        `;
        watermark.querySelectorAll('a').forEach(link => {
            link.addEventListener('mouseover', () => link.style.color = 'white');
            link.addEventListener('mouseout', () => link.style.color = 'rgba(255,255,255,0.7)');
        });
        panel.appendChild(watermark);
        document.body.appendChild(panel);
        
        setTimeout(() => {
            panel.style.transform = 'translateY(0)';
            panel.style.opacity = '1';
        }, 100);
        console.log("Floating Panel do resolvedor v32 criado com sucesso!");
    }

    async function fetchWithTimeout(resource, options = {}, timeout = 15000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(resource, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            if (error.name === 'AbortError') throw new Error('A requisição demorou muito e foi cancelada (Timeout).');
            throw error;
        }
    }
    
    async function imageUrlToBase64(url) { 
        try { 
            const r = await fetchWithTimeout(url); 
            const b = await r.blob(); 
            return new Promise(res => { 
                const reader = new FileReader(); 
                reader.onloadend = () => res(reader.result); 
                reader.readAsDataURL(b); 
            }); 
        } catch (e) { 
            console.error("Erro ao converter imagem:", e); 
            return null; 
        } 
    }

    setTimeout(criarFloatingPanel, 2000);
})();
