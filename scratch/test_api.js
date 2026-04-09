
async function testGoogleDictionary(word) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=at&dt=bd&dt=rm&q=${encodeURIComponent(word)}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

testGoogleDictionary('over');
