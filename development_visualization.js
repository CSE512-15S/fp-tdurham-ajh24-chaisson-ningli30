/****************************************************************
* 3D C. Elegans Development
* Melissa Chiasson, Timothy Durham, Andrew Hill
* CSE 512, Spring 2015
* Javascript file to initialize and control visualizations of 
* C. Elegans Development.
****************************************************************/


/****************************************************************
GLOBAL VARIABLES
****************************************************************/

//contains the data for each timepoint/cell
var csvdata = [];

//contains objects for progenitor cells preceding time series data
var P0 = {name:'P0', pred: -1};
var P1 = {name:'P1', pred: P0, succ: []};
var AB = {name:'AB', pred: P0, succ: []};

//maps cell name to an index into this.csvdata for each time point
var namemap = [];

//maps cell types to cell names
var celltypes = {};
var cellnames = ['EMS', 'P2', 'P3', 'P4'];
var celldesc = [];
var celltype = [];
var tissuetype = [];

//detect when all time points are loaded
var ready = false;

//blastomere predecessors are not as systematic as their daughters
var blastpred = {P0:'', AB:'P0', P1:'P0', EMS:'P1', P2:'P1',
                 MS:'EMS', E:'EMS', P3:'P2', C:'P2', P4:'P3', 
                 D:'P3', Z2:'P4', Z3:'P4'};

//timepoint counter for automated iteration through time points
var timepoint = 0;

//interval id for playback of development
var playback_id;

//3d variables
var x3d, scene;

//lineage picker idx, for unique ids
var lpidx = 1;

//other variables from scatterplot3D
var axisRange = [-1000, 1000];
var scales = [];
var initialDuration = 0;
var ease = 'linear';
var axisKeys = ["x", "y", "z"];

var load_idx = 0;

/****************************************************************
Lineage Highlighting Functions
****************************************************************/
function makeLPDivTemplate(){
    var lpsubdiv = d3.select('div.lineage-pickers').append('div')
        .attr('class', 'lineage-picker-template')
        .attr('id', 'lineage-picker-template')
        .attr('style', 'display: none;');
    //Construct a select box for picking cell lineages/cell types to highlight
    var id = 'selhi'+lpidx;
    var select = lpsubdiv.append('select')
        .attr('class', 'selhi')
        .attr('id', id)
        .attr('data-placeholder', 'Cell Lineage or Cell Type...')
        .attr('onchange', 'updatePlot()');
//        .attr('size', 15)
    select.append('option').attr('value', '');
    var optgroup = select.append('optgroup')
        .attr('label', 'Tissue Type');
    for(var i=0; i < tissuetype.length; i++){
        optgroup.append('option').attr('value', 'tt' + tissuetype[i]).html(tissuetype[i]);
    }
    optgroup = select.append('optgroup')
        .attr('label', 'Cell Type');
    for(i=0; i < celltype.length; i++){
        optgroup.append('option').attr('value', 'ct' + celltype[i]).html(celltype[i]);
    }
    optgroup = select.append('optgroup')
        .attr('label', 'Cell Description');
    for(i=0; i < celldesc.length; i++){
        optgroup.append('option').attr('value', 'cd' + celldesc[i]).html(celldesc[i]);
    }
    optgroup = d3.select('#'+id).append('optgroup')
        .attr('label', 'Cell Name');
    for(i=0; i < cellnames.length; i++){
        optgroup.append('option').attr('value', 'cn' + cellnames[i]).html(cellnames[i]);
    }
    lpsubdiv.append('input')
        .attr('type', 'color')
        .attr('value', '#ff0000')
        .attr('class', 'hicolor')
        .attr('id', 'hicolor'+lpidx)
        .attr('onchange', 'updatePlot()');
    lpsubdiv.append('input')
        .attr('type', 'button')
        .attr('value', '-')
        .attr('class', 'removehi')
        .attr('id', 'removehi'+lpidx)
        .attr('onclick', '(function(e, obj) {$(obj).parent().remove(); updatePlot();})(event, this)');
    lpidx++;
}

function cloneLPDiv(){
    var lpdivclone = $('#lineage-picker-template').clone(true);
    lpdivclone.attr('id', 'lineage-picker'+lpidx)
        .attr('class', 'lineage-picker')
        .attr('style', 'display: block');
    var childs = lpdivclone.children();
    var id;
    for(var i = 0; i < childs.length; i++){
        id = childs[i].id;
        childs[i].id = id.substr(0, id.length - 1) + lpidx;
    }
    lpdivclone.appendTo('.lineage-pickers');
    $('#selhi'+lpidx).chosen({search_contains:true});
    lpidx++;
}

function initializeLineagePicker(){
    d3.select('body')
        .append('div').attr('class', 'lineage-pickers');
    makeLPDivTemplate();
    cloneLPDiv();
    d3.select('body').append('input')
        .attr('type', 'button')
        .attr('value', '+')
        .attr('class', 'add-highlight')
        .attr('onclick', 'cloneLPDiv()');
    d3.select('body').append('input')
        .attr('type', 'button')
        .attr('value', 'Hide Non-Highlighted')
        .attr('class', 'add-highlight')
        .attr('id', 'showhide-highlight')
        .attr('onclick', '(function(e, obj) {obj.value = obj.value.substr(0,4) === "Hide" ? "Show Non-Highlighted" : "Hide Non-Highlighted"; updatePlot();})(event, this)');
}

//check to see if name is the name of a parent of object d
function isParentOf(d, name){
    if(d.name === name){
        return true;
    }else if(d.pred === -1){
        return false;
    }else{
        return isParentOf(d.pred, name);
    }
}

//update the plots if the highlight options are changed when the development
//animation is not playing.
function updatePlot(){
    var ppbutton = document.getElementById('playpause');
    if(ppbutton.innerHTML === 'Play'){
        plotData(timepoint, 0);
    }
}

function loadCellTypeMap(){
    d3.text('waterston_celltypes_filtered.csv', function (csvtext){
        //read all the cell types in
        var rows = d3.csv.parseRows(csvtext);

        for(var i=0; i < rows.length; i++){
            var row = rows[i];
            var cellname = row[0];
            cellnames.push(cellname);
            var n;
            if(cellname.substr(0,1) === 'E' || cellname.substr(0,1) === 'C' || cellname.substr(0,1) === 'D'){
                n = 1;
            }else if(cellname.substr(0,3) == 'EMS'){
                n = 3;
            }else{
                n = 2;
            }
            for(n; n <= cellname.length; n++){
                var prev = cellname.substr(0, n);
                if(cellnames.indexOf(prev) === -1){
                    cellnames.push(prev);
                }
            }
            if(cellname.substr(0,2) == 'MS'){
                cellname = 'E' + cellname;
            }else if(cellname.substr(0,1) == 'E'){
                cellname = 'EMS' + cellname;
            }else if(cellname.substr(0,1) == 'C'){
                cellname = 'P2' + cellname;
            }else if(cellname.substr(0,1) == 'D'){
                cellname = 'P2P3' + cellname;
            }else if(cellname.substr(0,2) == 'P3'){
                cellname = 'P2' + cellname;
            }else if(cellname.substr(0,2) == 'P4'){
                cellname = 'P2P3' + cellname;
            }else if(cellname.substr(0,1) == 'Z'){
                cellname = 'P2P3P4' + cellname;
            }
            for(var ct_idx=4; ct_idx < 7; ct_idx++){
                var ct = row[ct_idx];
                if(!(ct in celltypes)){
                    celltypes[ct] = '';
                }
                celltypes[ct] += cellname;
                if(ct_idx == 4 && celldesc.indexOf(ct) === -1){
                    celldesc.push(ct);
                }else if(ct_idx == 5 && celltype.indexOf(ct) === -1){
                    celltype.push(ct);
                }else if(ct_idx == 6 && tissuetype.indexOf(ct) === -1){
                    tissuetype.push(ct);
                }
            }
        }
        //set up filter-able drop-down box
        cellnames.sort();
        celldesc.sort();
        celltype.sort();
        initializeLineagePicker();
            // TODO this is here temporarily -- will be moved once updating of the tree is
            // implemented
            var root = getTreeRootFromTimepoints(csvdata, csvdata.length - 1);
            plotCellLineageTree(root);
    });
}

/****************************************************************
GRAPHICAL HELPER FUNCTIONS FOR 3D DEVELOPMENT PLOT
****************************************************************/
// Used to make 2d elements visible
function makeSolid(selection, color) {
    selection.append("appearance")
        .append("material")
        .attr("diffuseColor", color||"black")
    return selection;
}

// Initialize the axes lines and labels.
function initializePlot() {
    initializeAxis(0);
    initializeAxis(1);
    initializeAxis(2);
}

function initializeAxis( axisIndex ){
    var key = axisKeys[axisIndex];
    drawAxis( axisIndex, key, initialDuration );

    var scaleMin = axisRange[0];
    var scaleMax = axisRange[1];

    // the axis line
    var newAxisLine = scene.append("transform")
        .attr("class", axisKeys[axisIndex])
        .attr("rotation", ([[0,0,0,0],[0,0,1,Math.PI/2],[0,1,0,-Math.PI/2]][axisIndex]))
        .append("shape")
    newAxisLine
        .append("appearance")
        .append("material")
        .attr("emissiveColor", "lightgray")
    newAxisLine
        .append("polyline2d")
         // Line drawn along y axis does not render in Firefox, so draw one
         // along the x axis instead and rotate it (above).
        .attr("lineSegments", scaleMin + " 0," + scaleMax + " 0")
}

// Assign key to axis, creating or updating its ticks, grid lines, and labels.
function drawAxis( axisIndex, key, duration ) {
    var scale = d3.scale.linear()
        .domain( [-1000,1000] ) // demo data range
        .range( axisRange )
    
    scales[axisIndex] = scale;
}

// Update the data points (spheres) and stems.
function plotData( time_point, duration ) {
    if (!this.csvdata){
     console.log("no rows to plot.")
     return;
    }

    var x = scales[0], y = scales[1], z = scales[2];

    // Draw a sphere at each x,y,z coordinate.
    var timepoint_data = csvdata[time_point % csvdata.length];
    var datapoints = scene.selectAll(".datapoint").data( timepoint_data, function(d){return d.name;});
    datapoints.exit().remove();

    var new_data = datapoints.enter().append('transform')
        .attr('translation', function(d){
            if (d.pred == -1){
                return x(d.x) + " " + y(d.y) + " " + z(d.z);
            }else{
                return x(d.pred.x) + " " + y(d.pred.y) + " " + z(d.pred.z);
        }})
        .attr('class', 'datapoint')
        .attr('id', function(d){return d.name})
        .attr('scale', function(d){var ptrad = d.radius * 0.5; return [ptrad, ptrad, ptrad]});
    
    //use new_data to identify which nodes in the tree should be revealed
    var allnodes = d3.selectAll('.node');
//    allnodes.selectAll('.node-circle').attr('style', 'visibility:hidden;');
    allnodes.selectAll('.node-circle').attr('fill', 'steelblue');
    allnodes = allnodes.filter(function(d){
        var dpts = datapoints.filter(function(d2){return isParentOf(d2, d.name) ? this : null;});
        if(dpts[0].length > 0){
            return this;
        }
        return null;
//    }).selectAll('.node-circle').attr('style', 'visibility:visible');
    }).selectAll('.node-circle').attr('fill', 'red');
    
    //finish generating data points
    new_data = new_data.append('shape');
    new_data.append('appearance').append('material');
    new_data.append('sphere');

    //Collect highlight classes
    var picker_sel = document.getElementsByClassName('selhi');
    var picker_col = document.getElementsByClassName('hicolor');
    var cells = [];
    var colors = [];
    var ct_types = [];
    for(var i=0; i < picker_sel.length; i++){
        var selected = picker_sel[i].value;
        if(selected){
            var sel_type = selected.substr(0, 2);
            ct_types.push(sel_type);
            var sel_val = selected.substr(2);
            if(sel_type === 'cn'){
                cells.push(sel_val);
            }else {
                cells.push(celltypes[sel_val]);
            }
            colors.push(picker_col[i].value);
        }
    }
    
    //Coloring and code to highlight a specific lineage
    if(cells.length > 0){
        var pt_color_map = {};
        function calc_highlights(d, elt){
            var pt_colors = [];
            for(i=0; i < cells.length; i++){
//                if(ct_types[i] === 'cn' && d.name.indexOf(cells[i]) === 0){
                if(ct_types[i] === 'cn' && isParentOf(d, cells[i])){
                    pt_colors.push($.Color(colors[i]))
                }else if(cells[i].indexOf(d.name) > -1){
                    pt_colors.push($.Color(colors[i]));
                }
            }
            if(pt_colors.length === 0){
                return null;
            }else if(pt_colors.length === 1){
                pt_color_map[d.name] = pt_colors[0].toHexString();
            }else{
                pt_color_map[d.name] = Color_mixer.mix(pt_colors).toHexString();
            }
            return elt;
        }
        var showhide = document.getElementById('showhide-highlight').value;
        var transp;
        if(showhide.substr(0,4) === 'Show'){
            transp = 1;
        }else{
            transp = 0.8;
        }
        datapoints.selectAll('shape appearance material')
            .attr('transparency', transp)
            .attr('diffuseColor', 'steelblue');
        var to_color = datapoints.select(function(d){return calc_highlights(d, this);});
        to_color.selectAll('shape appearance material')
            .attr('transparency', 0)
            .attr('diffuseColor', function(d){return pt_color_map[d.name];});
    }else{
        datapoints.selectAll('shape appearance material')
            .attr('transparency', 0)
            .attr('diffuseColor', 'steelblue');
    }

    datapoints.transition().ease(ease).duration(duration)
        .attr("translation", function(row) {
            return x(row.x) + " " + y(row.y) + " " + z(row.z);
        });
}

/****************************************************************
HELPER FUNCTIONS FOR DATA PARSING AND INITIALIZATION
****************************************************************/
function parseCSV(csvdata_in) {
    var rows = d3.csv.parseRows(csvdata_in);
    var filtered_rows = [], parsed_data = [];
    var row;
    var xmean = 0, ymean = 0, zmean = 0;
    for (var i=0; i < rows.length; i++){
        row = rows[i];
        if(row[9].trim()){
            var x = +row[5], y = +row[6], z = +row[7] * 11.1, r = +row[8];
            xmean += x;
            ymean += y;
            zmean += z;
            filtered_rows.push([x, y, z, r, row[9]]);
        }
    }

    xmean = xmean/filtered_rows.length;
    ymean = ymean/filtered_rows.length;
    zmean = zmean/filtered_rows.length;
    for (var i=0; i < filtered_rows.length; i++){
        row = filtered_rows[i];
        parsed_data.push({'succ': [],
                          'x': row[0] - xmean,
                          'y': row[1] - ymean,
                          'z': row[2] - zmean,
                          'radius': row[3],
                          'name': row[4].trim()
        });
    }
    return parsed_data;
}

function loadTimePoints(idx){
//    if (idx == max){
//        ready = true;
//
//        var cellLineage = getTreeRootFromTimepoints(this.csvdata, idx)
//        plotCellLineageTree(cellLineage)
//
//        return;
//    }

    var basename = 't' + ("000" + (idx + 1)).substr(-3) + '-nuclei';
    var url = 'http://localhost:2255/timepoints/nuclei/' + basename;
    d3.text(url, function(tpdata){
        if (!tpdata){
            ready = true;
            d3.select('#timerange').attr('max', csvdata.length);
            //load cell type data
            loadCellTypeMap();
            return;
        }
        csvdata[idx] = parseCSV(tpdata);
        namemap[idx] = {};
        for(var i = 0; i < this.csvdata[idx].length; i++){
            //make entry in namemap for this cell at this timepoint
            var cell = this.csvdata[idx][i];
            this.namemap[idx][cell.name] = i;
            //get predecessor
            var pred_idx = this.namemap[idx-1][cell.name];
            if(typeof pred_idx == 'undefined'){
                var pred_name;
                //blastomere names are not systematic, so we have to look them up
                if(cell.name in blastpred){
                    pred_name = blastpred[cell.name];
                }else{
                    pred_name = cell.name.substr(0, cell.name.length - 1);
                }
                pred_idx = this.namemap[idx-1][pred_name];
            }
            if(typeof pred_idx == 'undefined'){
                cell.pred = -1;
            }else{
                cell.pred = this.csvdata[idx-1][pred_idx];
                //add cell to its predecessor's successor array
                cell.pred.succ.push(cell);
            }
        }
        loadTimePoints(idx + 1);
    });
}

/****************************************************************
INITIALIZATION AND CALLBACKS FOR VISUALIZATION
****************************************************************/
//Function to handle start/stop playback of development
function playpausedev(){
    var button = document.getElementById('playpause');
    if(button.innerHTML === "Play"){
        playback_id = setInterval(development, 1000);
        button.innerHTML = "Pause";
    }else{
        clearInterval(playback_id);
        button.innerHTML = "Play";
    }
}

function initializeEmbryo() {
    d3.text('http://localhost:2255/timepoints/nuclei/t001-nuclei', function(t0data){
        csvdata[0] = parseCSV(t0data);
        namemap[0] = {};
        for(var i = 0; i < csvdata[0].length; i++){
            var cell = csvdata[0][i];
            namemap[0][cell.name] = i;
            if(cell.name.substr(0, 2) === 'AB'){
                cell.pred = AB;
                AB.succ.push(cell);
            }else if(cell.name === 'EMS' || cell.name == 'P2'){
                cell.pred = P1;
                P1.succ.push(cell);
            }else{
                cell.pred = -1;
            }
//            csvdata[0][i].pred = -1;
        }
        console.log("Got data:")

        console.log("Init Plot")
        initializePlot();
//        initializeLineagePicker();
        console.log("Plot data")
        plotData(0, 5);
        loadTimePoints(1);

        // Build and plot the tree (Not yet working)
        //var cellLineage = getTreeRootFromTimepoints(this.csvdata, 0)
        //plotCellLineageTree(cellLineage)

//        setInterval( development, 1000 );
    });
  }

function development() {
    if (ready && x3d.node() && x3d.node().runtime ) {
//        var t_idx = timepoint % csvdata.length;
        timepoint++;
        plotData(timepoint,1000);
        document.getElementById('timerange').value = timepoint;

        // Update and plot the tree (Not yet working)
        //var cellLineage = getTreeRootFromTimepoints(this.csvdata, t_idx)
        //plotCellLineageTree(cellLineage)

    } else {
        console.log('x3d not ready.')
    }
}

//update the timepoint variable to match the slider value and run plotData
function updatetime() {
    timepoint = document.getElementById('timerange').value;
    plotData(timepoint, 500);
}

/****************************************************************
HELPER FUNCTIONS FOR LINEAGE TREE PLOTTING
****************************************************************/
function getTreeRootFromTimepoints(endTimepoint) {
  // Create a list of {'name': name, 'parent': parent} from the loaded time points
  cell_lineage = [];
  cell_lineage.push({'name': "P0", "parent":'null'});
  cell_lineage.push({'name': 'AB', 'parent':'P0'});
  cell_lineage.push({'name': 'P1', 'parent':'P0'});

  // Loop over all time points 
  for (j = 0; j < this.csvdata.length; j++) {
    flat_data = this.csvdata[j]

    // For each cell in time point, record the nodes next to the root and any transitions
    for (i = 0; i < flat_data.length; i++) {
      var name = flat_data[i].name
      var parent_name = flat_data[i].pred.name
  
      if (name === parent_name && j == 1) {
          if(name === 'ABa' || name === 'ABp'){
              parent_name = 'AB';
          }else{
              parent_name = 'P1';
          }
//        parent_name = "root"
        cell_lineage.push({"name": name, "parent": parent_name})
      } else if(j > 1 &&  name != parent_name){
        cell_lineage.push({"name": name, "parent": parent_name})
      }
    }
  }

  // create a name: node map
  var dataMap = cell_lineage.reduce(function(map, node) {
    map[node.name] = node;
    return map;
  }, {});

  // create the tree array
  var treeData = [];
  cell_lineage.forEach(function(node) {
    // add to parent
    var parent = dataMap[node.parent];
    if (parent) {
      // create child array if it doesn't exist
      (parent.children || (parent.children = []))
        // add node to child array
        .push(node)
    } else {
      // parent is null or missing
      treeData.push(node);
    }
  });

  root = treeData[0];
  return root;
}

function plotCellLineageTree(root) {
  /****************************************************************
  Initial sizing of the lineage tree
  ****************************************************************/
  var margin = {top: 10, right: 10, bottom: 10, left: 10},
  height = 600 - margin.top - margin.bottom;


  // Set up the SVG element
  var svg = d3.select("body")
    .append('div')
    .attr("class", 'lineage_tree')
    .append("svg")
      .attr("width", "100%")
      .attr("height", height + margin.top + margin.bottom)
      .append("g")

  // Dynamically get the current width
  var width = $('.lineage_tree').width() - margin.right - margin.left;

  /****************************************************************
  Set up distortion scale and associate slider
  ****************************************************************/
  // TODO this scale still seems really finicky. Settings are not currently very robust.
  var xScale = d3.fisheye.scale(d3.scale.linear).domain([0, width/7.3]).range([0, width])

  var distortion_slider = d3.select('.lineage_tree')
    .append('input')
      .attr('type', 'range')
      .attr('id', 'distortion_slider')
      .attr('defaultValue', 0)
      .attr('min', 0)
      .attr('max', width)
      .attr('step', 1)
      .attr('value', 0)

  distortion_slider.on("input", function() {
    setting = document.getElementById('distortion_slider').value
    console.log(setting)
    xScale.distortion(40).focus(setting);
    node.call(position_node);
    link.call(position_links);
    text.call(position_text);
    node.call(scale_radius);
  });

  /****************************************************************
  Generate Tree Layout
  ****************************************************************/   
  var tree = d3.layout.tree()
      .size([height/2, width])
      .sort(function(a, b) { return d3.ascending(a.name, b.name); });

  var diagonal = d3.svg.diagonal()
      .projection(function(d) { return [xScale(d.x), d.y]; });

  // Compute the tree layout.
  var nodes = tree.nodes(root),
      links = tree.links(nodes);

  // Normalize for fixed-depth.
  nodes.forEach(function(d) { d.y = d.depth * 50;});

  /****************************************************************
  Add graphics to nodes and links in tree layout
  ****************************************************************/
  // Enter the nodes.
  var node = svg.append("g")
    .attr("class", "nodes")
    .selectAll(".node")
      .data(nodes, function(d) { return d.id || (d.id = ++i); })
        .enter().append("g").
        attr("class", "node")
        .append('circle')
          .attr('class', 'node-circle')
          .attr("r", 10)
          .attr("fill", "steelblue")
          .attr("transform", function(d) { 
            return "translate(" + 0 + "," + d.y + ")"; }) // 0 is required for x to make edges match up with nodes
          .call(position_node)
          .call(scale_radius)

  // Add text labels to each node
  var text = svg.selectAll(".node").append('text')
    .attr('class', 'text')
    .text(function(d) {return d.name})
    .call(position_text)

  // Add links between node
  var link = svg.selectAll("path.link")
    .data(links)
    .enter().insert("path", "g")
      .attr("class", "link")
      .attr("d", diagonal)
      .call(position_links)

  /****************************************************************
  Functions for positioning and scaling elements accounting for distortion and position within window
  ****************************************************************/
  function is_close_to_plot_border(element) {
    var currentPosition = xScale(element.x)

    // If element is within 100 px of either side and at a depth greater than 2, return TRUE
    return (currentPosition < 100 || currentPosition > width - 100) && element.depth > 2
  }

  function position_node(node) {
    node 
      .attr("cx", function(d) {return xScale(d.x);})
      .attr("x", function(d) {return xScale(d.x);})
      .attr("y", function(d) {return d.y;});
        //.attr("cy", function(d) { return yScale(y(d)); }) // TODO commenting this out made tree height issues go away
        //.attr("r", function(d) { return radiusScale(radius(d)); });
  }

  function position_text(text) {
    text 
      .attr("cx", function(d) {return xScale(d.x);})
      .attr("x", function(d) {return xScale(d.x);})
      .attr("y", function(d) {return d.y;})

      // Don't show text if points are close to the edges, but still show the blastomeres
      .style("visibility", function(d) {
        return  is_close_to_plot_border(d) ? "hidden" : "visible"
      })

      .attr("transform", function(d) {return "translate(-5, 15)rotate(90" + "," + xScale(d.x) + "," + d.y + ")"})

        //.attr("cy", function(d) { return yScale(y(d)); }) // TODO commenting this out made tree height issues go away
        //.attr("r", function(d) { return radiusScale(radius(d)); });
  }

  function scale_radius(circle) {
    var maxCircleRadius = 8

    circle
      .attr("r", function(d) {
        var currentPosition = xScale(d.x)
        // Scale radius smaller when points get close to edges for visibility, but don't change the blastomeres
        return is_close_to_plot_border(d) ? Math.min(Math.min(maxCircleRadius/100 * xScale(d.x), maxCircleRadius/100 * (width - currentPosition)), maxCircleRadius) : maxCircleRadius
      });
  }

  function position_links(link) {
    diagonal.projection(function(d) {return [xScale(d.x), d.y]; }) 
    link.attr("d", diagonal);
  }

  return;
}

/****************************************************************
Main Thread of execution
****************************************************************/
function scatterPlot3d( parent ) {
    x3d = parent  
        .append("x3d")
        .style( "width", parseInt(parent.style("width"))+"px" )
        .style( "height", parseInt(parent.style("height"))+"px" )
        .style( "border", "none" )

    scene = x3d.append("scene")

    scene.append("orthoviewpoint")
        .attr( "centerOfRotation", [0, 0, 0])
        .attr( "fieldOfView", [-300, -300, 800, 800])
        .attr( "orientation", [-0.5, 1, 0.2, 1.12*Math.PI/4])
        .attr( "position", [600, 300, 800])

    console.log("Reading in embryo positions.");
    initializeEmbryo();
    console.log("Loading data")
    
    // Add play button for time points
    d3.select('body').append('button')
        .attr('id', 'playpause')
        .attr('onclick', "playpausedev()")
        .html("Play");

    // Add slider for time points
    d3.select('body').append('input')
        .attr('type', 'range')
        .attr('id', 'timerange')
        .attr('defaultValue', 0)
        .attr('min', 0)
        .attr('step', 1)
        .attr('value', 0)
        .attr('onchange', 'updatetime()')
}