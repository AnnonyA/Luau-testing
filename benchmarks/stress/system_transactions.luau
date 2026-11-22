-- Nested transactions over a proxy with journaling, commit and rollback.
return function(seed)
    local total = seed + 7
    local events = {}
    local function mark(tag, value)
        events[#events + 1] = tag .. ":" .. tostring(value)
        return value
    end
    local backing = {a = seed, b = seed + 1, c = 3}
    local stack = {}
    local proxy = setmetatable({}, {
        __index = function(_, key)
            mark("get", key)
            return backing[key]
        end,
        __newindex = function(_, key, value)
            mark("set", key .. "=" .. tostring(value))
            local transaction = stack[#stack]
            if transaction and not transaction.seen[key] then
                transaction.seen[key] = true
                transaction.journal[#transaction.journal + 1] = {key, backing[key]}
            end
            backing[key] = value
        end,
    })
    local function begin()
        stack[#stack + 1] = {seen = {}, journal = {}}
        mark("begin", #stack)
    end
    local function finish(commit)
        local frame = stack[#stack]
        stack[#stack] = nil
        mark("finish", commit)
        if commit then
            local parent = stack[#stack]
            if parent then
                for _, entry in frame.journal do
                    local key = entry[1]
                    if not parent.seen[key] then
                        parent.seen[key] = true
                        parent.journal[#parent.journal + 1] = entry
                    end
                end
            end
        else
            for i = #frame.journal, 1, -1 do
                local entry = frame.journal[i]
                mark("undo", entry[1])
                backing[entry[1]] = entry[2]
            end
        end
    end
    local function atomic(body)
        begin()
        local result = table.pack(pcall(body))
        finish(result[1])
        return table.unpack(result, 1, result.n)
    end
    for i = 1, 8 do
        local ok, value, absent = atomic(function()
            proxy.a += i
            proxy.b, proxy.c = proxy.c + i, proxy.b - i
            local innerOk, innerValue = atomic(function()
                proxy.a += seed % 5
                proxy.c += i * 2
                if (seed + i) % 3 == 0 then error("inner") end
                return proxy.a + proxy.c
            end)
            mark("inner", innerOk)
            if innerOk then proxy.b += innerValue end
            if (seed + i) % 4 == 0 then error("outer") end
            return proxy.a + proxy.b + proxy.c, nil
        end)
        mark("outer", ok)
        if ok and absent == nil then total += value else total -= i end
        mark("state", backing.a + backing.b + backing.c)
    end
    for _, key in {"a", "b", "c"} do
        total += backing[key]
        mark("final", key .. backing[key])
    end
    return total, table.concat(events, ","), nil, #events
end
