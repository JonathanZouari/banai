"""Cheap guards that run before Pydantic sees a design (security review 2026-10-17, MEDIUM #1).

Pydantic reports every unknown key, so a body stuffed with hundreds of thousands of keys costs far
more to reject than to send. The largest valid design (20 compartments, 300 items and 20 doors, all
with custom appearances) has about 10,400 JSON nodes, so 25,000 leaves a wide margin.
"""

MAX_DESIGN_NODES = 25_000


def too_many_nodes(value: object, limit: int = MAX_DESIGN_NODES) -> bool:
    """True when `value` (parsed JSON) has more than `limit` nodes; keys count. Stops at the limit."""
    stack, count = [value], 0
    while stack:
        item = stack.pop()
        count += 1
        if isinstance(item, dict):
            count += len(item)
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
        if count > limit:
            return True
    return False
