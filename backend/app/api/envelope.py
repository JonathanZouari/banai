"""Response envelope `{success, data, error}` shared by the API routes."""

from fastapi.responses import JSONResponse


def ok(data: object) -> dict:
    return {"success": True, "data": data}


def fail(status_code: int, code: str, message: str, details: object = None) -> JSONResponse:
    error = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return JSONResponse(status_code=status_code, content={"success": False, "data": None, "error": error})
