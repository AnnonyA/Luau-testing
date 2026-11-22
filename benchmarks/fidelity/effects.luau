-- Deliberately unrolled source: inference must be labelled, and each lookup
-- and argument must still happen after the previous call's mutations.
return function(seed)
    local history = {}
    local function log(value)
        history[#history + 1] = tostring(value)
    end
    local proxy = setmetatable({}, {
        __index = function(_, key)
            log(key)
            return function(_, amount)
                log(amount)
                seed += 1
            end
        end,
    })
    proxy:deposit((seed + 1) % 5)
    proxy:deposit((seed + 2) % 5)
    proxy:deposit((seed + 3) % 5)
    proxy:deposit((seed + 4) % 5)
    return seed, table.concat(history, ","), nil, #history
end
