local function makeTracker(p)
	local v = p
	local v2 = {}

	local function add(p2)
		v += p2
		table.insert(v2, v)
		return v
	end

	local function snapshot()
		return v, table.concat(v2, ",")
	end

	return add, snapshot
end

return function(p)
	local tracker, snapshot = makeTracker(4)

	for i = 1, p do
		if i % 2 ~= 0 and tracker(i * 2) > 20 then
			break
		end
	end

	local v, v2 = snapshot()
	local function tuple()
		if v > 10 then
			return v, nil, v2
		end

		return v, v2
	end

	return tuple()
end