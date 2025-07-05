document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const dom = {
        xmlUploadInput: document.getElementById('xml-upload-input'),
        paletteNameInput: document.getElementById('palette-name'),
        paletteTypeSelect: document.getElementById('palette-type'),
        addColorBtn: document.getElementById('add-color-btn'),
        eyedropperBtn: document.getElementById('eyedropper-btn'),
        currentColorsDiv: document.getElementById('current-colors'),
        createPaletteBtn: document.getElementById('create-palette-btn'),
        createdPalettesList: document.getElementById('created-palettes-list'),
        outputXmlTextarea: document.getElementById('output-xml'),
        copyBtn: document.getElementById('copy-btn'),
        downloadXmlBtn: document.getElementById('download-xml-btn'),
        clearAllBtn: document.getElementById('clear-all-btn'),
        colorPlane: document.getElementById('color-plane'),
        planeCursor: document.getElementById('plane-cursor'),
        hueSlider: document.getElementById('hue-slider'),
        colorPreview: document.getElementById('color-preview'),
        hexInput: document.getElementById('hex-input'),
        rgbR: document.getElementById('rgb-r'),
        rgbG: document.getElementById('rgb-g'),
        rgbB: document.getElementById('rgb-b'),
        imageUploadInput: document.getElementById('image-upload-input'),
        imagePreviewContainer: document.getElementById('image-preview-container'),
        extractedColorsContainer: document.getElementById('extracted-colors-container'),
    };

    // --- アプリケーションの状態 ---
    let state = {
        currentColors: [],
        createdPalettes: [],
        picker: { h: 0, s: 1, v: 1 }, // HSVモデル
        editingPaletteIndex: -1, // -1は新規作成モード
    };
    const STORAGE_KEY = 'chromaCraftPalettes';

    // --- メイン処理 ---
    function init() {
        loadPalettesFromLocalStorage();
        initializePicker();
        addEventListeners();
        renderCreatedPalettes();
        generateXml();
        updateCreatePaletteButton();
    }

    // --- イベントリスナーの集約 ---
    function addEventListeners() {
        dom.xmlUploadInput.addEventListener('change', handleXmlUpload);
        dom.addColorBtn.addEventListener('click', () => addColorToList(dom.hexInput.value.toUpperCase()));
        dom.eyedropperBtn.addEventListener('click', handleEyedropper);
        dom.createPaletteBtn.addEventListener('click', handleCreateOrUpdatePalette);
        dom.clearAllBtn.addEventListener('click', handleClearAll);
        dom.copyBtn.addEventListener('click', handleCopy);
        dom.downloadXmlBtn.addEventListener('click', handleDownload);
        dom.imageUploadInput.addEventListener('change', handleImageUpload);
    }

    // --- イベントハンドラ ---
    function handleXmlUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                parseAndLoadXml(e.target.result);
            } catch (error) {
                alert('TPSファイルの解析に失敗しました。');
                console.error("TPS Parse Error:", error);
            }
        };
        reader.readAsText(file);
        event.target.value = null;
    }

    async function handleEyedropper() {
        if (!window.EyeDropper) {
            alert('お使いのブラウザはスポイト機能に対応していません。');
            return;
        }
        try {
            const result = await new EyeDropper().open();
            const hex = result.sRGBHex.toUpperCase();
            const hsv = rgbToHsv(...Object.values(hexToRgb(hex)));
            state.picker = hsv;
            dom.hueSlider.value = state.picker.h;
            updatePickerUI();
        } catch (e) {
            console.log('スポイト機能がキャンセルされました。');
        }
    }

    function handleCreateOrUpdatePalette() {
        const name = dom.paletteNameInput.value.trim();
        const type = dom.paletteTypeSelect.value;
        if (!name || state.currentColors.length === 0) {
            alert('パレット名を入力し、色を1つ以上追加してください。');
            return;
        }

        const newPalette = { name, type, colors: [...state.currentColors] };
        if (state.editingPaletteIndex === -1) {
            state.createdPalettes.push(newPalette);
        } else {
            state.createdPalettes[state.editingPaletteIndex] = newPalette;
        }
        
        resetEditMode();
        savePalettesToLocalStorage();
        renderCreatedPalettes();
        generateXml();
    }
    
    function handleClearAll() {
        if (state.createdPalettes.length > 0 && confirm('作成済みのすべてのパレットをリセットしますか？')) {
            state.createdPalettes = [];
            resetEditMode();
            savePalettesToLocalStorage();
            renderCreatedPalettes();
            generateXml();
        }
    }

    function handleCopy() {
        if (!dom.outputXmlTextarea.value) return;
        navigator.clipboard.writeText(dom.outputXmlTextarea.value).then(() => {
            alert('XMLをクリップボードにコピーしました！');
        }).catch(() => {
            alert('コピーに失敗しました。');
        });
    }

    function handleDownload() {
        if (!dom.outputXmlTextarea.value) return;
        const blob = new Blob([dom.outputXmlTextarea.value], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Preferences.tps';
        a.click();
        URL.revokeObjectURL(url);
    }

    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            dom.imagePreviewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            dom.extractedColorsContainer.innerHTML = '<p>色を抽出中...</p>';
            const img = new Image();
            img.onload = () => renderExtractedColors(extractColorsFromImage(img));
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // --- カラーピッカー関連 ---
    function initializePicker() {
        updatePickerUI();
        let isDragging = false;
        const startDrag = (e) => { isDragging = true; handlePlaneInteraction(e); };
        const drag = (e) => { if (isDragging) handlePlaneInteraction(e); };
        const stopDrag = () => { isDragging = false; };
        
        dom.colorPlane.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
        dom.colorPlane.addEventListener('touchstart', startDrag);
        document.addEventListener('touchmove', drag);
        document.addEventListener('touchend', stopDrag);

        dom.hueSlider.addEventListener('input', () => {
            state.picker.h = parseInt(dom.hueSlider.value, 10);
            updatePickerUI();
        });
        dom.hexInput.addEventListener('change', () => {
            const hex = dom.hexInput.value.startsWith('#') ? dom.hexInput.value : '#' + dom.hexInput.value;
            if (/^#[0-9A-F]{6}$/i.test(hex)) {
                const hsv = rgbToHsv(...Object.values(hexToRgb(hex)));
                state.picker = hsv;
                dom.hueSlider.value = state.picker.h;
                updatePickerUI();
            }
        });
        const handleRgbInputChange = () => {
            const r = parseInt(dom.rgbR.value, 10) || 0;
            const g = parseInt(dom.rgbG.value, 10) || 0;
            const b = parseInt(dom.rgbB.value, 10) || 0;
            
            const validR = Math.max(0, Math.min(255, r));
            const validG = Math.max(0, Math.min(255, g));
            const validB = Math.max(0, Math.min(255, b));

            const hsv = rgbToHsv(validR, validG, validB);
            state.picker = hsv;
            dom.hueSlider.value = state.picker.h;
            updatePickerUI();
        };
        dom.rgbR.addEventListener('input', handleRgbInputChange);
        dom.rgbG.addEventListener('input', handleRgbInputChange);
        dom.rgbB.addEventListener('input', handleRgbInputChange);
    }

    function handlePlaneInteraction(e) {
        e.preventDefault();
        const rect = dom.colorPlane.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        state.picker.s = Math.max(0, Math.min(1, x / rect.width));
        state.picker.v = 1 - Math.max(0, Math.min(1, y / rect.height));
        updatePickerUI();
    }

    function updatePickerUI() {
        dom.colorPlane.style.backgroundColor = `hsl(${state.picker.h}, 100%, 50%)`;
        const planeRect = dom.colorPlane.getBoundingClientRect();
        dom.planeCursor.style.left = `${state.picker.s * planeRect.width}px`;
        dom.planeCursor.style.top = `${(1 - state.picker.v) * planeRect.height}px`;
        const rgb = hsvToRgb(state.picker.h, state.picker.s, state.picker.v);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        dom.colorPreview.style.backgroundColor = hex;
        dom.hexInput.value = hex.toUpperCase();
        dom.rgbR.value = rgb.r;
        dom.rgbG.value = rgb.g;
        dom.rgbB.value = rgb.b;
    }

    // --- 状態管理 & 描画 ---
    function addColorToList(color) {
        if (color && !state.currentColors.includes(color)) {
            state.currentColors.push(color);
            renderCurrentColors();
        }
    }

    function renderCurrentColors() {
        dom.currentColorsDiv.innerHTML = '';
        if (state.currentColors.length === 0) {
            dom.currentColorsDiv.innerHTML = '<p class="placeholder-text">上の方法で色を追加してください</p>';
            return;
        }
        state.currentColors.forEach((color, index) => {
            const chip = document.createElement('div');
            chip.className = 'color-chip';
            chip.innerHTML = `<span class="color-swatch" style="background-color: ${color};"></span><span>${color}</span><span class="remove-btn" data-index="${index}" title="削除">✖</span>`;
            chip.querySelector('.remove-btn').addEventListener('click', () => {
                state.currentColors.splice(index, 1);
                renderCurrentColors();
            });
            dom.currentColorsDiv.appendChild(chip);
        });
    }

    function renderCreatedPalettes() {
        dom.createdPalettesList.innerHTML = '';
        state.createdPalettes.forEach((palette, index) => {
            const li = document.createElement('li');
            li.className = (index === state.editingPaletteIndex) ? 'editing' : '';
            const typeMap = {
                'regular': 'カテゴリー',
                'ordered-sequential': '連続',
                'ordered-diverging': '分岐'
            };
            const displayType = typeMap[palette.type] || palette.type;
            li.innerHTML = `<span><strong>${escapeHtml(palette.name)}</strong> (${palette.colors.length}色, ${displayType})</span><span class="remove-btn" data-index="${index}">✖</span>`;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-btn')) return;
                if (confirm(`${palette.name} を編集しますか？`)) {
                    enterEditMode(index);
                }
            });
            li.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`${palette.name} を削除しますか？`)) {
                    state.createdPalettes.splice(index, 1);
                    if(state.editingPaletteIndex === index) resetEditMode();
                    savePalettesToLocalStorage();
                    renderCreatedPalettes();
                    generateXml();
                }
            });
            dom.createdPalettesList.appendChild(li);
        });
    }
    
    function enterEditMode(index) {
        state.editingPaletteIndex = index;
        const p = state.createdPalettes[index];
        dom.paletteNameInput.value = p.name;
        dom.paletteTypeSelect.value = p.type;
        state.currentColors = [...p.colors];
        renderCurrentColors();
        updateCreatePaletteButton();
        renderCreatedPalettes();
        dom.paletteNameInput.focus();
    }

    function resetEditMode() {
        state.editingPaletteIndex = -1;
        dom.paletteNameInput.value = '';
        state.currentColors = [];
        renderCurrentColors();
        updateCreatePaletteButton();
        renderCreatedPalettes();
    }

    function updateCreatePaletteButton() {
        if (state.editingPaletteIndex === -1) {
            dom.createPaletteBtn.textContent = 'パレットをリストに追加';
            dom.createPaletteBtn.classList.remove('btn-primary');
            dom.createPaletteBtn.classList.add('btn-success');
        } else {
            dom.createPaletteBtn.textContent = 'パレットを更新';
            dom.createPaletteBtn.classList.remove('btn-success');
            dom.createPaletteBtn.classList.add('btn-primary');
        }
    }
    
    function renderExtractedColors(colors) {
        dom.extractedColorsContainer.innerHTML = '';
        if (colors.length === 0) return;
        colors.forEach(color => {
            const swatch = document.createElement('span');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.title = `クリックして追加: ${color}`;
            swatch.addEventListener('click', () => addColorToList(color));
            dom.extractedColorsContainer.appendChild(swatch);
        });
    }

    // --- データ処理 ---
    function parseAndLoadXml(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");
        if (xmlDoc.getElementsByTagName("parsererror").length) throw new Error("Invalid format");
        
        let loadedCount = 0;
        xmlDoc.querySelectorAll('preferences > color-palette').forEach(node => {
            const name = node.getAttribute('name');
            const type = node.getAttribute('type');
            const colors = Array.from(node.querySelectorAll('color')).map(n => n.textContent.toUpperCase());
            if (name && type && colors.length > 0) {
                state.createdPalettes.push({ name, type, colors });
                loadedCount++;
            }
        });
        if (loadedCount > 0) {
            alert(`${loadedCount}個のパレットを読み込みました。`);
            savePalettesToLocalStorage();
            renderCreatedPalettes();
            generateXml();
        } else {
            alert('有効なカラーパレットが見つかりませんでした。');
        }
    }

    function generateXml() {
        if (state.createdPalettes.length === 0) {
            dom.outputXmlTextarea.value = 'パレットを作成すると、ここにXMLが生成されます...';
            return;
        }
        const palettesXml = state.createdPalettes.map(p => 
            `    <color-palette name="${escapeHtml(p.name)}" type="${p.type}">\n` +
            p.colors.map(c => `      <color>${c.toUpperCase()}</color>`).join('\n') +
            `\n    </color-palette>`
        ).join('\n');
        dom.outputXmlTextarea.value = `<?xml version='1.0'?>\n<workbook>\n  <preferences>\n${palettesXml}\n  </preferences>\n</workbook>`;
    }

    function extractColorsFromImage(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const MAX_WIDTH = 150;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const colorCounts = {};
        const STEP = 5;
        for (let i = 0; i < imageData.length; i += 4 * STEP) {
            if (imageData[i + 3] < 128) continue;
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            const colorKey = `${r},${g},${b}`;
            colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
        }
        return Object.keys(colorCounts)
            .sort((a, b) => colorCounts[b] - colorCounts[a])
            .slice(0, 12)
            .map(key => {
                const [r, g, b] = key.split(',').map(Number);
                return rgbToHex(r, g, b);
            });
    }

    // --- ストレージ & ユーティリティ ---
    const savePalettesToLocalStorage = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state.createdPalettes));
    const loadPalettesFromLocalStorage = () => {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) state.createdPalettes = JSON.parse(savedData);
    };
    const escapeHtml = (str) => str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
    const hsvToRgb = (h,s,v) => {let f=h/60,i=f^0,c=v*(1-s),x=v*(1-s*(f-i)),y=v*(1-s*(1-(f-i))),rgb=[[v,y,c],[x,v,c],[c,v,y],[c,x,v],[y,c,v],[v,c,x]][i%6];return {r:rgb[0]*255|0,g:rgb[1]*255|0,b:rgb[2]*255|0}};
    const rgbToHex = (r,g,b) => "#"+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
    const hexToRgb = h => ({r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)});
    const rgbToHsv = (r,g,b) => {r/=255,g/=255,b/=255;let M=Math.max(r,g,b),m=Math.min(r,g,b),C=M-m,h,s=M===0?0:C/M,v=M;if(C===0)h=0;else{switch(M){case r:h=(g-b)/C%6;break;case g:h=(b-r)/C+2;break;case b:h=(r-g)/C+4;break}h=h*60}return{h:h<0?h+360:h,s:s,v:v}};

    // --- アプリケーション起動 ---
    init();
});
