-- Open returns and nils must survive readability improvements.
return function(seed)
    local history = {}
    local function calculate(value)
        history[#history + 1] = tostring(value)
        if value % 2 == 0 then
            return value * 2, nil, value + 3
        end
        return value + 1, nil, value * 3
    end
    local first, absent, last = calculate(seed)
    local total = first + last
    if absent == nil and total > 10 then
        total += calculate(1)
    end
    return total, table.concat(history, ","), nil, #history
end
