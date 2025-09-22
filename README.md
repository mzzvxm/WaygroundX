# 🚀 Wayground (Quizziz) Bypass\</h1\>

## 👨‍💻 Autor

Feito por **mzzvxm**

  * **GitHub:** [@mzzvxm](https://www.google.com/search?q=https://github.com/mzzvxm)
  * **Instagram:** [@mzzvxm](https://www.google.com/search?q=https://instagram.com/mzzvxm)

## 🖥️ Script para uso (copie e cole)  
```js
javascript:fetch("https://raw.githubusercontent.com/mzzvxm/WaygroundX/main/bypass.js").then(r=>r.text()).then(eval);
```

\<div align="center"\>
\<img src="[https://img.shields.io/badge/Autor-mzzvxm-5865F2?style=for-the-badge](https://www.google.com/search?q=https://img.shields.io/badge/Autor-mzzvxm-5865F2%3Fstyle%3Dfor-the-badge)" /\>
\<img src="[https://img.shields.io/badge/Versão-29.0-33B565?style=for-the-badge](https://www.google.com/search?q=https://img.shields.io/badge/Vers%C3%A3o-29.0-33B565%3Fstyle%3Dfor-the-badge)" /\>
\<img src="[https://img.shields.io/badge/Licença-MIT-blue?style=for-the-badge](https://www.google.com/search?q=https://img.shields.io/badge/Licen%C3%A7a-MIT-blue%3Fstyle%3Dfor-the-badge)" /\>
\<img src="[https://img.shields.io/badge/Plataforma-Tampermonkey-yellow?style=for-the-badge](https://www.google.com/search?q=https://img.shields.io/badge/Plataforma-Tampermonkey-yellow%3Fstyle%3Dfor-the-badge)" /\>
\<img src="[https://img.shields.io/badge/API-Google%20Gemini-4285F4?style=for-the-badge](https://www.google.com/search?q=https://img.shields.io/badge/API-Google%2520Gemini-4285F4%3Fstyle%3Dfor-the-badge)" /\>
\</div\>

\<p align="center"\>
Um UserScript que utiliza a IA do Google Gemini para resolver de forma inteligente uma vasta gama de questões na plataforma Quizizz/Wayground
\</p\>

## ✅ Funcionalidades

  * **Resolução Inteligente por IA:** Utiliza o modelo `gemini-1.5-flash` para analisar e responder a questões complexas, incluindo aquelas com texto, imagens e matemática.

  * **Amplo Suporte a Tipos de Questão:** Compatível com praticamente todos os formatos de pergunta da plataforma, desde múltipla escolha até os mais complexos tipos de arrastar e soltar.

  * **Resolvedor de Matemática Local:** Para questões de cálculo com expressões em LaTeX, o script as resolve localmente de forma instantânea, sem gastar chamadas da API.

  * **Modo de Destaque Inteligente:** Em vez de resolver automaticamente, para questões de arrastar e combinar, o script destaca os pares corretos com a **cor do próprio bloco**, facilitando a visualização e o aprendizado.

  * **Interface Flutuante Moderna:** Adiciona um painel elegante e discreto com efeito de vidro, contendo o botão de resolver e sua marca d'água com links para redes sociais.

  * **Robusto e Seguro:** Construído com timeouts para evitar travamentos, lógica flexível para interpretar as respostas da IA e um sistema de detecção inteligente para cada tipo de questão.

## 🚀 Como Usar

### 1\. Instalar um Gerenciador de UserScripts

Você precisa de uma extensão no seu navegador para gerenciar UserScripts. A mais recomendada é o **Tampermonkey**.

  * [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
  * [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
  * [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### 2\. Instalar o Script

1.  Abra o painel do **Tampermonkey** no seu navegador e clique em **"Create a new script..."**.
2.  Apague todo o código de exemplo.
3.  Copie o código completo do arquivo `script.js` deste repositório.
4.  Cole o código na tela do Tampermonkey.
5.  Encontre a linha:
    ```javascript
    const GEMINI_API_KEY = "SUA_CHAVE_AQUI"; 
    ```
    E **substitua `SUA_CHAVE_AQUI`** pela sua chave de API que você copiou no passo anterior.
6.  Salve o script (`Ctrl + S`).

### 3\. Usar\!

Acesse uma partida no site alvo (configurado no `@match`). O painel flutuante aparecerá no canto inferior direito. Basta clicar nele para resolver a questão.

## ⚠️ Aviso

Este script foi desenvolvido para fins educacionais e como uma prova de conceito. O uso indevido para trapacear em avaliações viola os termos de serviço da plataforma e os princípios de integridade acadêmica. **Use com responsabilidade.**

O script depende da estrutura HTML do site. Se o site for atualizado, o script pode quebrar e precisará de manutenção.

## 📜 Licença

Este projeto está sob a licença [MIT](https://opensource.org/licenses/MIT).
