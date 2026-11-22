-- Original benchmark fixture: arithmetic, control flow, captures, and tuple arity.
-- It has no Roblox services or external state and can run in a sandboxed Luau VM.
local function makeTracker(start)
    local value = start
    local events = {}

    local function add(amount)
        value += amount
        table.insert(events, value)
        return value
    end

    local function snapshot()
        return value, table.concat(events, ",")
    end

    return add, snapshot
end

return function(limit)
    local add, snapshot = makeTracker(4)
    for index = 1, limit do
        if index % 2 == 0 then
            continue
        end
        local current = add(index * 2)
        if current > 20 then
            break
        end
    end

    local value, history = snapshot()
    local function tuple()
        if value > 10 then
            return value, nil, history
        end
        return value, history
    end

    return tuple()
end
