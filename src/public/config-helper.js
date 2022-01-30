
const urlParams = new URLSearchParams(window.location.search);

const resolveIntUrlParam = (param, defaultVal) => getIntUrlParam(param) !== null ? getIntUrlParam(param) : defaultVal;

const getIntUrlParam = (parameter) => {
        const paramVal = urlParams.get(parameter);
        return paramVal ? parseInt(paramVal) : null;
    }

export {
    resolveIntUrlParam
}