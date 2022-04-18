
const urlParams = new URLSearchParams(window.location.search);

const resolveIntUrlParam = (param, defaultVal) => getIntUrlParam(param) !== null ? getIntUrlParam(param) : defaultVal;

const urlParamPresent = (param) => getIntUrlParam(param) !== null;

const getIntUrlParam = (parameter) => {
        const paramVal = urlParams.get(parameter);
        return paramVal ? parseInt(paramVal) : null;
    }

export {
    resolveIntUrlParam,
    urlParamPresent
}