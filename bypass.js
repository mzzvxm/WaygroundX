// ==UserScript==
// @name         Quizizz Bypass
// @version      45.0
// @description  Resolve questões do Quizizz - Wayground
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
    // --- Integração OpenRouter/DeepSeek ---
    const OPENROUTER_API_KEY = "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"; // Coloque sua chave do OpenRouter aqui
    const DEEPSEEK_MODEL_NAME = "deepseek/deepseek-chat"; // Modelo DeepSeek (pode ser "deepseek/deepseek-v2")
    let currentAiProvider = 'gemini'; // 'gemini' ou 'deepseek'
    // -----------------------------------------------------------------------------------

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

    function waitForElementToDisappear(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (!element) {
                    clearInterval(interval);
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    reject(new Error(`Elemento "${selector}" não desapareceu após ${timeout / 1000} segundos.`));
                }
            }, 100);
        });
    }


    async function extrairDadosDaQuestao() {
    try {
        const questionTextElement = document.querySelector('#questionText');
        const questionText = questionTextElement ? questionTextElement.innerText.trim().replace(/\s+/g, ' ') : "Não foi possível encontrar o texto da pergunta.";
        const questionImageElement = document.querySelector('img[data-testid="question-container-image"]');
        const questionImageUrl = questionImageElement ? questionImageElement.src : null;

        const extractText = (el) => {
            const mathElement = el.querySelector('annotation[encoding="application/x-tex"]');
            return mathElement ? mathElement.textContent.trim() : el.querySelector('#optionText')?.innerText.trim() || '';
        };

        const dropdownButtons = document.querySelectorAll('button.options-dropdown');
        if (dropdownButtons.length > 1) {
            console.log("Tipo Múltiplos Dropdowns detectado.");
            const dropdowns = [];
            let questionTextWithPlaceholders = questionTextElement.innerHTML;
            const popperSelector = '.v-popper__popper--shown';

            dropdownButtons.forEach((btn, i) => {
                const placeholder = ` [RESPOSTA ${i + 1}] `;
                const wrapper = btn.closest('.dropdown-wrapper');
                if (wrapper) {
                     questionTextWithPlaceholders = questionTextWithPlaceholders.replace(wrapper.outerHTML, placeholder);
                }
            });

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = questionTextWithPlaceholders;
            const cleanQuestionText = tempDiv.innerText.replace(/\s+/g, ' ');

            let allAvailableOptions = [];
            const firstBtn = dropdownButtons[0];
            firstBtn.click();
            try {
                const optionElements = await waitForElement(`${popperSelector} button.dropdown-option`, true, 2000);
                allAvailableOptions = Array.from(optionElements).map(el => el.innerText.trim());
                console.log("Pool de opções detectado:", allAvailableOptions);
            } catch (e) {
                console.error("Falha ao ler o pool de opções do primeiro dropdown.", e);
                if (document.querySelector(popperSelector)) document.body.click();
            }

            if (document.querySelector(popperSelector)) document.body.click();
            try {
                await waitForElementToDisappear(popperSelector, 2000);
            } catch (e) {
                console.warn("Popper não fechou, mas continuando...");
            }

            dropdownButtons.forEach((btn, i) => {
                 dropdowns.push({
                    button: btn,
                    placeholder: `[RESPOSTA ${i + 1}]`
                });
            });

            console.log("Texto Limpo Enviado para IA:", cleanQuestionText);
            return { questionText: cleanQuestionText, questionImageUrl, questionType: 'multi_dropdown', dropdowns, allAvailableOptions };
        }

        if (dropdownButtons.length === 1) {
            return { questionText, questionImageUrl, questionType: 'dropdown', dropdownButton: dropdownButtons[0] };
        }

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

        // (v43) "Match Order" (Texto ou Imagem)
        const matchContainer = document.querySelector('.match-order-options-container, .question-options-layout');
        if (matchContainer) {
            const draggableItemElements = Array.from(matchContainer.querySelectorAll('.match-order-option.is-option-tile'));
            const dropZoneElements = Array.from(matchContainer.querySelectorAll('.match-order-option.is-drop-tile'));

            const isImageMatch = draggableItemElements.length > 0 && (draggableItemElements[0].querySelector('.option-image') || draggableItemElements[0].dataset.type === 'image');

            if (isImageMatch) {
                console.log("Tipo Match-Order (Imagem p/ Texto) detectado.");
                const draggableItems = [];
                for (let i = 0; i < draggableItemElements.length; i++) {
                    const el = draggableItemElements[i];
                    const imgDiv = el.querySelector('.option-image');
                    const style = imgDiv ? window.getComputedStyle(imgDiv).backgroundImage : null;
                    const urlMatch = style ? style.match(/url\("(.+?)"\)/) : null;
                    let imageUrl = urlMatch ? urlMatch[1] : null;

                    if (!imageUrl) {
                        const dataCy = el.dataset.cy;
                        if (dataCy && dataCy.includes('url(')) {
                            const urlMatchCy = dataCy.match(/url\((.+)\)/);
                            if (urlMatchCy) imageUrl = urlMatchCy[1].replace(/\?w=\d+&h=\d+$/, '');
                        }
                    }

                    if (imageUrl) {
                        // --- CORREÇÃO (v45): Removido colchetes do ID ---
                        draggableItems.push({ id: `IMAGEM ${i + 1}`, imageUrl, element: el });
                    }
                }

                const dropZones = dropZoneElements.map(el => ({ text: extractText(el), element: el }));

                return { questionText, questionImageUrl, questionType: 'match_image_to_text', draggableItems, dropZones };

            } else if (draggableItemElements.length > 0 && dropZoneElements.length > 0) {
                const draggableItems = draggableItemElements.map(el => ({ text: extractText(el), element: el }));
                const dropZones = dropZoneElements.map(el => ({ text: extractText(el), element: el }));

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

        // --- 1. Lógica de Prompt ---
        let promptDeInstrucao = "", formattedOptions = "";
        switch (quizData.questionType) {
            case 'multi_dropdown':
                promptDeInstrucao = `Esta é uma questão com múltiplas lacunas ([RESPOSTA X]). As opções disponíveis são um pool compartilhado e cada opção só pode ser usada uma vez. Determine a resposta correta para CADA placeholder. Responda com cada resposta em uma nova linha, no formato '[RESPOSTA X]: Resposta Correta'. Se algum placeholder não tiver uma resposta lógica no pool (ex: está fora da sequência), omita-o da resposta.`;
                formattedOptions = "Pool de Opções Disponíveis: " + quizData.allAvailableOptions.join(', ');
                break;
            case 'match_image_to_text':
                // --- CORREÇÃO (v45): Prompt ajustado para pedir ID sem colchetes ---
                promptDeInstrucao = `Esta é uma questão de combinar imagens com seus textos correspondentes. Para cada imagem, forneça o par correto no formato EXATO: 'Texto da Opção -> ID da Imagem' (ex: 90° -> IMAGEM 3), com cada par em uma nova linha.`;
                const dropZoneTexts = quizData.dropZones.map(item => `- "${item.text}"`).join('\n');
                formattedOptions = `Opções de Texto (Locais para Soltar):\n${dropZoneTexts}`;
                break;
            case 'match_order':
                promptDeInstrucao = `Responda com os pares no formato EXATO: 'Texto do Local para Soltar -> Texto do Item para Arrastar', com cada par em uma nova linha.`;
                const draggables = quizData.draggableItems.map(item => `- "${item.text}"`).join('\n');
                const droppables = quizData.dropZones.map(item => `- "${item.text}"`).join('\n');
                formattedOptions = `Itens para Arrastar:\n${draggables}\n\nLocais para Soltar:\n${droppables}`;
                break;
            case 'multi_drag_into_blank': promptDeInstrucao = `Esta é uma questão de combinar múltiplas sentenças com suas expressões corretas. Responda com os pares no formato EXATO: 'Sentença da pergunta -> Expressão da opção', com cada par em uma nova linha.`; const prompts = quizData.dropZones.map(item => `- "${item.prompt}"`).join('\n'); const options = quizData.draggableOptions.map(item => `- "${item.text}"`).join('\n'); formattedOptions = `Sentenças:\n${prompts}\n\nExpressões (Opções):\n${options}`; break;
            case 'equation': promptDeInstrucao = `Resolva a seguinte equação ou inequação. Forneça apenas a expressão final simplificada (ex: x = 5, ou y > 3).`; formattedOptions = `EQUAÇÃO: "${quizData.questionText}"`; break;
            case 'dropdown': case 'single_choice': promptDeInstrucao = `Responda APENAS com o texto exato da ÚNICA alternativa correta.`; formattedOptions = "OPÇÕES:\n" + quizData.options.map(opt => `- "${opt.text}"`).join('\n'); break;
            case 'reorder': promptDeInstrucao = `A tarefa é: "${quizData.questionText}". Forneça a ordem correta listando os textos dos itens, um por linha, do primeiro ao último.`; formattedOptions = "Itens para ordenar:\n" + quizData.draggableItems.map(item => `- "${item.text}"`).join('\n'); break;
            case 'drag_into_blank': promptDeInstrucao = `Responda APENAS com o texto da ÚNICA opção correta que preenche a lacuna.`; formattedOptions = "Opções para arrastar:\n" + quizData.draggableOptions.map(item => `- "${item.text}"`).join('\n'); break;
            case 'open_ended': promptDeInstrucao = `Responda APENAS com a palavra ou frase curta que preenche a lacuna.`; break;
            case 'multiple_choice': promptDeInstrucao = `Responda APENAS com os textos exatos de TODAS as alternativas corretas, separando cada uma em uma NOVA LINHA.`; formattedOptions = "OPÇÕES:\n" + quizData.options.map(opt => `- "${opt.text}"`).join('\n'); break;
        }
        let textPrompt = `${promptDeInstrucao}\n\n---\nPERGUNTA: "${quizData.questionText}"\n---\n${formattedOptions}`;

        // --- 2. Processamento de Imagem ---
        let base64Image = null;
        if (quizData.questionImageUrl) {
            base64Image = await imageUrlToBase64(quizData.questionImageUrl);
        }
        const hasDraggableImages = quizData.questionType === 'match_image_to_text';

        // Verificação de Imagem do DeepSeek
        if (currentAiProvider === 'deepseek' && (base64Image || hasDraggableImages)) {
            console.warn("DeepSeek não suporta imagens. Mostrando aviso...");
            try {
                const acaoUsuario = await mostrarAvisoDeepSeekImagem();
                if (acaoUsuario === 'gemini') {
                    console.log("Usuário escolheu usar Gemini.");
                    currentAiProvider = 'gemini';
                    const aiToggleBtn = document.getElementById('ai-toggle-btn');
                    if (aiToggleBtn) {
                        aiToggleBtn.innerText = 'IA: Gemini';
                        aiToggleBtn.style.color = 'rgba(255, 255, 255, 0.6)';
                    }
                } else if (acaoUsuario === 'sem_imagem') {
                    console.log("Usuário escolheu enviar para o DeepSeek sem a imagem.");
                    base64Image = null;
                    if (quizData.questionType === 'match_image_to_text') {
                        quizData.questionType = 'match_order'; // Downgrade
                        quizData.draggableItems = quizData.draggableItems.map(item => ({
                            text: item.id, // Usa "IMAGEM 1" como texto
                            element: item.element
                        }));
                        // --- CORREÇÃO (v45): Prompt de fallback ajustado ---
                        promptDeInstrucao = `Responda com os pares no formato EXATO: 'Texto do Local para Soltar -> ID da Imagem' (ex: 90° -> IMAGEM 3), com cada par em uma nova linha.`;
                        const draggables = quizData.draggableItems.map(item => `- "${item.text}"`).join('\n');
                        const droppables = quizData.dropZones.map(item => `- "${item.text}"`).join('\n');
                        formattedOptions = `Itens para Arrastar (IDs):\n${draggables}\n\nLocais para Soltar:\n${droppables}`;
                        textPrompt = `${promptDeInstrucao}\n\n---\nPERGUNTA: "${quizData.questionText}"\n---\n${formattedOptions}`;
                    }
                }
            } catch (error) {
                console.error(error.message);
                throw error;
            }
        }

        // --- 3. Lógica de Fetch ---
        try {
            let aiResponseText = null;
            if (currentAiProvider === 'gemini') {
                console.log("Usando Provedor: Gemini");
                let geminiKeyFailed = false;
                for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
                    const currentKey = GEMINI_API_KEYS[currentApiKeyIndex];
                    if (!currentKey || currentKey.includes("SUA_") || currentKey.length < 30) {
                        console.warn(`Chave de API Gemini #${currentApiKeyIndex + 1} parece ser um placeholder. Pulando...`);
                        currentApiKeyIndex = (currentApiKeyIndex + 1) % GEMINI_API_KEYS.length;
                        continue;
                    }
                    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentKey}`;

                    let promptParts = [{ text: textPrompt }];

                    if (base64Image) {
                        const [header, data] = base64Image.split(',');
                        let mimeType = header.match(/:(.*?);/)[1];
                        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) mimeType = 'image/jpeg';
                        promptParts.push({ inline_data: { mime_type: mimeType, data: data } });
                    }

                    if (quizData.questionType === 'match_image_to_text') {
                        promptParts.push({ text: "\n\nIMAGENS (Itens para Arrastar):\n" });
                        for (const item of quizData.draggableItems) {
                             const base64 = await imageUrlToBase64(item.imageUrl);
                             if (base64) {
                                const [header, data] = base64.split(',');
                                let mimeType = header.match(/:(.*?);/)[1];
                                if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) mimeType = 'image/jpeg';
                                promptParts.push({ inline_data: { mime_type: mimeType, data: data } });
                                promptParts.push({ text: `- ${item.id}` }); // Envia " - IMAGEM 1"
                             }
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
                            aiResponseText = data.candidates[0].content.parts[0].text;
                            console.log(`Sucesso com a Chave API Gemini #${currentApiKeyIndex + 1}.`);
                            break;
                        }
                        const errorData = await response.json();
                        const errorMessage = errorData.error?.message || `Erro ${response.status}`;
                        console.warn(`Chave API Gemini #${currentApiKeyIndex + 1} falhou: ${errorMessage}. Tentando a próxima...`);
                        lastAiResponse = `Falha na Chave Gemini #${currentApiKeyIndex + 1}: ${errorMessage}`;
                    } catch (error) {
                        console.warn(`Erro na requisição com a Chave API Gemini #${currentApiKeyIndex + 1}: ${error.message}. Tentando a próxima...`);
                        lastAiResponse = `Falha na Chave Gemini #${currentApiKeyIndex + 1}: ${error.message}`;
                    }
                    currentApiKeyIndex = (currentApiKeyIndex + 1) % GEMINI_API_KEYS.length;
                    if (i === GEMINI_API_KEYS.length - 1) {
                         geminiKeyFailed = true;
                    }
                }
                if (!aiResponseText && geminiKeyFailed) {
                    throw new Error("Todas as chaves de API do Gemini falharam.");
                }

            } else if (currentAiProvider === 'deepseek') {
                console.log("Usando Provedor: DeepSeek (via OpenRouter)");
                if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes("SUA_") || OPENROUTER_API_KEY.length < 30) {
                     throw new Error("Chave de API do OpenRouter não configurada ou inválida.");
                }
                const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
                const body = JSON.stringify({
                    model: DEEPSEEK_MODEL_NAME,
                    messages: [ { role: 'user', content: textPrompt } ],
                    max_tokens: 1024
                });
                const response = await fetchWithTimeout(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                        'HTTP-Referer': 'https://github.com/mzzvxm',
                        'X-Title': 'Quizizz Bypass Script'
                    },
                    body: body
                });
                if (response.ok) {
                    const data = await response.json();
                    aiResponseText = data.choices[0].message.content;
                } else {
                    const errorData = await response.json();
                    const errorMessage = errorData.error?.message || `Erro ${response.status}`;
                    throw new Error(`Falha na API DeepSeek/OpenRouter: ${errorMessage}`);
                }
            }

            // --- 4. Retorno ---
            console.log("Resposta bruta da IA:", aiResponseText);
            lastAiResponse = aiResponseText;
            return aiResponseText;

        } catch (error) {
            console.error(`Falha ao obter resposta da IA (${currentAiProvider}):`, error.message);
            lastAiResponse = `Erro: ${error.message}`;
            throw error;
        }
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
        case 'multi_dropdown':
            const popperSelector = '.v-popper__popper--shown';
            const answers = aiAnswerText.split('\n').map(line => {
                const match = line.match(/\[RESPOSTA (\d+)\]:\s*(.*)/i);
                if (!match) return null;
                return {
                    index: parseInt(match[1], 10) - 1,
                    answer: match[2].trim().replace(/["'`]/g, '')
                };
            }).filter(Boolean);

            const answersMap = new Map(answers.map(a => [a.index, a.answer]));
            const placeholderText = 'Selecionar resposta';

            // Fase 1: Limpeza
            console.log("FASE 1: Limpando dropdowns com respostas erradas ou desnecessárias...");
            for (let i = 0; i < quizData.dropdowns.length; i++) {
                const dd = quizData.dropdowns[i];
                const currentButtonText = dd.button.innerText.trim();
                const targetAnswer = answersMap.get(i);

                const isFilled = currentButtonText !== placeholderText;
                const hasTarget = !!targetAnswer;
                const isWrong = isFilled && hasTarget && currentButtonText !== targetAnswer;
                const isUnnecessary = isFilled && !hasTarget;

                if (isWrong || isUnnecessary) {
                    console.log(`Limpando Dropdown #${i + 1} (estava com "${currentButtonText}")...`);
                    dd.button.click();
                    try {
                        const optionElements = await waitForElement(`${popperSelector} button.dropdown-option`, true, 2000);
                        const selectedOption = Array.from(optionElements).find(el => el.innerText.trim() === currentButtonText);
                        if (selectedOption) {
                            selectedOption.click();
                        } else {
                            document.body.click();
                        }
                        await waitForElementToDisappear(popperSelector, 2000);
                    } catch (e) {
                        console.error(`Erro ao tentar limpar Dropdown #${i + 1}: ${e.message}`);
                        if (document.querySelector(popperSelector)) {
                            document.body.click();
                            try { await waitForElementToDisappear(popperSelector, 2000); } catch (err) {}
                        }
                    }
                }
            }

            // Fase 2: Preenchimento
            console.log("FASE 2: Preenchendo respostas corretas da IA...");
            for (const res of answers) {
                const dd = quizData.dropdowns[res.index];
                if (!dd) {
                    console.error(`Dropdown com índice ${res.index} não encontrado.`);
                    continue;
                }
                const currentButtonText = dd.button.innerText.trim();
                if (currentButtonText === res.answer) {
                    continue;
                }
                dd.button.click();
                try {
                    const optionElements = await waitForElement(`${popperSelector} button.dropdown-option`, true, 2000);
                    const targetOption = Array.from(optionElements).find(el => el.innerText.trim() === res.answer);
                    if (targetOption) {
                        if (targetOption.disabled || targetOption.classList.contains('used-option')) {
                            console.warn(`Opção "${res.answer}" para Dropdown #${res.index + 1} ainda está desabilitada.`);
                            document.body.click();
                        } else {
                            targetOption.click();
                        }
                    } else {
                        console.error(`Opção "${res.answer}" não encontrada no Dropdown #${res.index + 1}. (A IA pode ter alucinado)`);
                        document.body.click();
                    }
                    await waitForElementToDisappear(popperSelector, 2000);
                } catch (e) {
                    console.error(`Erro ao tentar selecionar para o dropdown #${res.index + 1}: ${e.message}`);
                    if (document.querySelector(popperSelector)) {
                        document.body.click();
                        try { await waitForElementToDisappear(popperSelector, 2000); } catch (err) {}
                    }
                }
            }
            break;

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

        case 'match_image_to_text':
            const highlightColorsImg = ['#FFD700', '#00FFFF', '#FF00FF', '#7FFF00', '#FF8C00', '#DA70D6'];
            let colorIndexImg = 0;

            // --- CORREÇÃO (v45): Remove colchetes, se houver, para garantir a correspondência ---
            const cleanPairPartImg = (str) => str.replace(/[`"\[\]]/g, '').trim();

            const pairingsImg = aiAnswerText.split('\n').filter(line => line.includes('->')).map(line => {
                const parts = line.split('->');
                return parts.length === 2 ? [cleanPairPartImg(parts[0]), cleanPairPartImg(parts[1])] : null;
            }).filter(Boolean);

            if (pairingsImg.length === 0) { console.error("Não foi possível extrair pares válidos (Texto -> ID Imagem) da resposta da IA."); return; }

            // Map: "IMAGEM 1" -> element
            const draggablesMapImg = new Map(quizData.draggableItems.map(i => [i.id, i.element]));
            // Map: "40° OR 140°" -> element
            const dropZonesMapImg = new Map(quizData.dropZones.map(i => [i.text, i.element]));

            for (const [partA, partB] of pairingsImg) {
                let sourceEl, destinationEl;
                // partA = "40° OR 140°", partB = "IMAGEM 1"
                if (dropZonesMapImg.has(partA) && draggablesMapImg.has(partB)) {
                    destinationEl = dropZonesMapImg.get(partA);
                    sourceEl = draggablesMapImg.get(partB);
                } else if (dropZonesMapImg.has(partB) && draggablesMapImg.has(partA)) {
                    destinationEl = dropZonesMapImg.get(partB);
                    sourceEl = draggablesMapImg.get(partA);
                } else {
                    console.warn(`Par não mapeado: "${partA}" (existe? ${dropZonesMapImg.has(partA)}) -> "${partB}" (existe? ${draggablesMapImg.has(partB)})`);
                    continue;
                }

                if (sourceEl && destinationEl) {
                    const color = highlightColorsImg[colorIndexImg % highlightColorsImg.length];
                    const highlightStyle = `box-shadow: 0 0 15px 5px ${color}; border-radius: 8px;`;
                    sourceEl.style.cssText = highlightStyle;
                    destinationEl.style.cssText = highlightStyle;
                    colorIndexImg++;
                }
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

        if (quizData.questionType === 'multi_dropdown') {
             console.log("Usando IA para resolver múltiplos dropdowns (lógica de pool)...");
             const aiAnswer = await obterRespostaDaIA(quizData);
             if (aiAnswer) {
                 await performAction(aiAnswer, quizData);
             }
        } else if (quizData.questionType === 'dropdown') {
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
        if (error.message && !error.message.includes("Ação cancelada")) {
            alert("Ocorreu um erro: " + error.message);
        }
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

    function mostrarAvisoDeepSeekImagem() {
        return new Promise((resolve, reject) => {
            const oldModal = document.getElementById('deepseek-warning-modal');
            if (oldModal) oldModal.remove();

            const overlay = document.createElement('div');
            overlay.id = 'deepseek-warning-modal';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: '2147483648',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'opacity 0.2s ease', opacity: '0'
            });

            const modalContainer = document.createElement('div');
            Object.assign(modalContainer.style, {
                background: 'rgba(26, 27, 30, 0.9)', backdropFilter: 'blur(10px)',
                padding: '24px', borderRadius: '16px', color: 'white',
                fontFamily: 'system-ui, sans-serif', maxWidth: '400px',
                textAlign: 'center', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
            });

            const title = document.createElement('h3');
            title.innerText = '⚠️ DeepSeek Não Vê Imagens';
            Object.assign(title.style, {
                margin: '0 0 12px 0', fontSize: '18px', fontWeight: '600'
            });

            const message = document.createElement('p');
            message.innerText = 'Esta pergunta contém uma ou mais imagens que o DeepSeek não pode processar. O que você deseja fazer?';
            Object.assign(message.style, {
                margin: '0 0 20px 0', fontSize: '14px', lineHeight: '1.5',
                color: 'rgba(255, 255, 255, 0.8)'
            });

            const buttonContainer = document.createElement('div');
            Object.assign(buttonContainer.style, {
                display: 'flex', flexDirection: 'column', gap: '10px'
            });

            const closeModal = () => {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 200);
            };

            const btnGemini = document.createElement('button');
            btnGemini.innerText = 'Usar a Gemini (Recomendado)';
            Object.assign(btnGemini.style, {
                background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
                border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer',
                fontSize: '14px', fontWeight: '500', padding: '12px',
                transition: 'all 0.2s ease'
            });
            btnGemini.onmouseover = () => btnGemini.style.opacity = '0.9';
            btnGemini.onmouseout = () => btnGemini.style.opacity = '1';
            btnGemini.onclick = () => {
                closeModal();
                resolve('gemini');
            };

            const btnNoImage = document.createElement('button');
            btnNoImage.innerText = 'Responder sem enviar Imagem';
            Object.assign(btnNoImage.style, {
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px', color: 'rgba(255, 255, 255, 0.8)',
                cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                padding: '12px', transition: 'all 0.2s ease'
            });
            btnNoImage.onmouseover = () => btnNoImage.style.background = 'rgba(255, 255, 255, 0.15)';
            btnNoImage.onmouseout = () => btnNoImage.style.background = 'rgba(255, 255, 255, 0.1)';
            btnNoImage.onclick = () => {
                closeModal();
                resolve('sem_imagem');
            };

            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    closeModal();
                    reject(new Error('Ação cancelada.'));
                }
            };

            buttonContainer.appendChild(btnGemini);
            buttonContainer.appendChild(btnNoImage);
            modalContainer.appendChild(title);
            modalContainer.appendChild(message);
            modalContainer.appendChild(buttonContainer);
            overlay.appendChild(modalContainer);
            document.body.appendChild(overlay);

            setTimeout(() => overlay.style.opacity = '1', 10);
        });
    }

    function criarFloatingPanel() {
        if (document.getElementById('mzzvxm-floating-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'mzzvxm-floating-panel';
        Object.assign(panel.style, {
            position: 'fixed', bottom: '60px', right: '20px', zIndex: '2147483647',
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

        const aiToggleBtn = document.createElement('button');
        aiToggleBtn.id = 'ai-toggle-btn';
        aiToggleBtn.innerText = 'IA: Gemini';
        Object.assign(aiToggleBtn.style, {
            background: 'none', border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer',
            fontSize: '11px', padding: '4px 8px', borderRadius: '6px',
            transition: 'all 0.2s ease',
            marginBottom: '4px'
        });
        aiToggleBtn.addEventListener('click', () => {
            if (currentAiProvider === 'gemini') {
                currentAiProvider = 'deepseek';
                aiToggleBtn.innerText = 'IA: DeepSeek';
                aiToggleBtn.style.color = '#a78bfa';
            } else {
                currentAiProvider = 'gemini';
                aiToggleBtn.innerText = 'IA: Gemini';
                aiToggleBtn.style.color = 'rgba(255, 255, 255, 0.6)';
            }
            console.log(`Provedor de IA alterado para: ${currentAiProvider}`);
        });
        panel.appendChild(aiToggleBtn);

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
                <a href="httpsa://instagram.com/mzzvxm" target="_blank" title="Instagram" style="line-height: 0; color: inherit; transition: color 0.2s ease;">${instagramIcon}</a>
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
        console.log("Floating Panel do resolvedor v45 (correção de ID de imagem) criado com sucesso!");
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
            const cacheBustUrl = new URL(url);
            cacheBustUrl.searchParams.set('_t', new Date().getTime());

            const r = await fetchWithTimeout(cacheBustUrl.href, { cache: 'no-store' });
            const b = await r.blob();
            return new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onloadend = () => res(reader.result);
                reader.onerror = (e) => {
                    console.error("Erro no FileReader:", e);
                    rej(e);
                };
                reader.readAsDataURL(b);
            });
        } catch (e) {
            console.error(`Erro ao converter imagem: ${e.message}`, url);
            return null;
        }
    }

    setTimeout(criarFloatingPanel, 2000);
})();
