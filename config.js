document.getElementById('toggle-models').addEventListener('click', () => {
    const modelsList = document.getElementById('models-list');
    if (modelsList.style.display === 'none') {
        modelsList.style.display = 'block';
    } else {
        modelsList.style.display = 'none';
    }
}); 