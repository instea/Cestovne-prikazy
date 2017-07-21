node {
    stage 'Checkout'
    checkout scm
    
    stage 'Build'
    sh 'sh bin/build.sh'
    dir('/opt/cestaky/src/') {
        sh 'rm -rf server src build public node_modules package.json'
    }
    sh 'cp -r -t /opt/cestaky/src server src build public node_modules package.json'
    
    stage 'Deploy'
    dir('/opt/cestaky/src/') {
        sh 'sudo service cestaky restart'
    }
}
