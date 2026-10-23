"""Accounts PROTOTYPE (branch feature/auth): the signed-in user's saved designs.

A design saved while signed in belongs to that user and also gets a normal private link, so sharing
works as before. The owner can list their designs and reopen or save them without the link token.
Anything that is not the caller's own design answers the same 404 as a missing one."""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from app.agent.language import Language
from app.api.auth import current_user
from app.api.designs import NO_STORE, REVISION_PATTERN, _design_id, _fail, _hash, _parse_save
from app.api.agent import error
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.persistence.repository import StorageError, get_repository

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

MAX_LISTED = 100  # ASSUMPTION: a configurable default; the list shows the most recently saved first


@router.get("/me/designs")
async def list_my_designs(request: Request, language: Language = "he"):
    signed_in = await current_user(request, language)
    if isinstance(signed_in, JSONResponse):
        return signed_in
    repository = get_repository()
    if repository is None:
        return _fail(503, "STORAGE_UNAVAILABLE", language)
    try:
        designs = await run_in_threadpool(repository.list_owned, signed_in[1].id, MAX_LISTED)
    except StorageError:
        logger.exception("Listing a user's designs failed")
        return _fail(503, "STORAGE_ERROR", language)
    data = {"designs": [{"designId": d.design_id, "name": d.name, "revision": d.revision, "updatedAt": d.updated_at}
                        for d in designs]}
    return JSONResponse(content={"success": True, "data": data}, headers=NO_STORE)


@router.post("/me/designs", status_code=201)
async def create_my_design(request: Request):
    # Authenticate before reading the body: an anonymous request never reaches design validation.
    signed_in = await current_user(request, "he")
    if isinstance(signed_in, JSONResponse):
        return signed_in
    repository = get_repository()
    if repository is None:
        return _fail(503, "STORAGE_UNAVAILABLE", "he")
    parsed = await _parse_save(request)
    if isinstance(parsed, JSONResponse):
        return parsed
    token = secrets.token_urlsafe(32)
    try:
        design_id, revision = await run_in_threadpool(
            repository.create, _hash(token), parsed.name, parsed.design, signed_in[1].id,
        )
    except StorageError:
        logger.exception("Saving a new account design failed")
        return _fail(503, "STORAGE_ERROR", parsed.language)
    data = {"designId": design_id, "accessToken": token, "revision": revision}
    return JSONResponse(status_code=201, content={"success": True, "data": data}, headers=NO_STORE)


@router.get("/me/designs/{raw_id}")
async def get_my_design(raw_id: str, request: Request, language: Language = "he"):
    signed_in = await current_user(request, language)
    if isinstance(signed_in, JSONResponse):
        return signed_in
    repository = get_repository()
    if repository is None:
        return _fail(503, "STORAGE_UNAVAILABLE", language)
    design_id = _design_id(raw_id)
    if design_id is None:
        return _fail(404, "NOT_FOUND", language)
    try:
        saved = await run_in_threadpool(repository.get, design_id)
    except StorageError:
        logger.exception("Loading an account design failed")
        return _fail(503, "STORAGE_ERROR", language)
    if saved is None or saved.owner_id != signed_in[1].id:
        return _fail(404, "NOT_FOUND", language)
    try:
        design = apply_ops(saved.design, [], load_catalog())  # the catalog may have changed since the save
    except DomainError as exc:
        return error(422, exc.code, exc.message, exc.path)
    data = {"designId": design_id, "name": saved.name, "design": design, "revision": saved.revision}
    return JSONResponse(content={"success": True, "data": data}, headers=NO_STORE)


@router.put("/me/designs/{raw_id}")
async def update_my_design(raw_id: str, request: Request):
    signed_in = await current_user(request, "he")
    if isinstance(signed_in, JSONResponse):
        return signed_in
    repository = get_repository()
    if repository is None:
        return _fail(503, "STORAGE_UNAVAILABLE", "he")
    design_id = _design_id(raw_id)
    if design_id is None:
        return _fail(404, "NOT_FOUND", "he")
    expected = request.headers.get("If-Match", "").strip('" ')
    if not REVISION_PATTERN.fullmatch(expected):
        return _fail(422, "INVALID_REQUEST", "he")
    parsed = await _parse_save(request)
    if isinstance(parsed, JSONResponse):
        return parsed
    owner_id = signed_in[1].id
    try:
        saved = await run_in_threadpool(repository.get, design_id)
        if saved is None or saved.owner_id != owner_id:
            return _fail(404, "NOT_FOUND", parsed.language)
        revision = await run_in_threadpool(
            repository.update_owned, design_id, owner_id, int(expected), parsed.name, parsed.design,
        )
    except StorageError:
        logger.exception("Saving an account design failed")
        return _fail(503, "STORAGE_ERROR", parsed.language)
    if revision is None:
        return _fail(409, "STALE", parsed.language)
    return JSONResponse(content={"success": True, "data": {"designId": design_id, "revision": revision}}, headers=NO_STORE)
