const word = '关系';
fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&dt=rm&q=${encodeURIComponent(word)}`)
  .then(res => res.json())
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
  });
